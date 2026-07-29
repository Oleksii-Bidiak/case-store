import { Test, TestingModule } from '@nestjs/testing';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { BannerPlacement, PublishStatus } from '@prisma/client';
import { PinoLogger } from 'nestjs-pino';
import { ReorderStaleError } from '../common/reorder';
import { BannerRepository } from './banners.repository';
import { BannerService } from './banners.service';
import { BannerEntity } from './entities';
import { RevalidationNotifier } from '../publishing';

const mockBanner = {
  id: 'banner-uuid-1',
  placement: BannerPlacement.HERO_SLIDE,
  title: 'Summer Sale',
  subtitle: 'Up to -50%',
  imageUrl: '/images/summer.jpg',
  imageBlurDataUrl: null,
  ctaLabel: 'Shop now',
  ctaHref: '/catalog',
  theme: 'accent',
  sortOrder: 0,
  status: PublishStatus.PUBLISHED,
  publishedAt: new Date('2026-07-01T00:00:00.000Z'),
  scheduledAt: null,
  createdAt: new Date('2026-07-01T00:00:00.000Z'),
  updatedAt: new Date('2026-07-01T00:00:00.000Z'),
};

const draftBanner = {
  ...mockBanner,
  id: 'banner-uuid-2',
  title: 'Winter Teaser',
  status: PublishStatus.DRAFT,
  publishedAt: null,
};

const bannerRepositoryMock = {
  findAllPublished: jest.fn(),
  findAllAdmin: jest.fn(),
  findById: jest.fn(),
  create: jest.fn(),
  update: jest.fn(),
  publish: jest.fn(),
  unpublish: jest.fn(),
  delete: jest.fn(),
  reorderPlacement: jest.fn(),
};

const revalidationMock = { revalidate: jest.fn() };

const pinoLoggerMock = {
  setContext: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
};

describe('BannerService', () => {
  let service: BannerService;

  beforeEach(async () => {
    jest.clearAllMocks();
    revalidationMock.revalidate.mockResolvedValue(undefined);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BannerService,
        { provide: BannerRepository, useValue: bannerRepositoryMock },
        { provide: RevalidationNotifier, useValue: revalidationMock },
        { provide: PinoLogger, useValue: pinoLoggerMock },
      ],
    }).compile();

    service = module.get<BannerService>(BannerService);
  });

  describe('findAllPublished', () => {
    it('returns published banners as entities and forwards the placement filter', async () => {
      bannerRepositoryMock.findAllPublished.mockResolvedValue([mockBanner]);

      const result = await service.findAllPublished({ placement: BannerPlacement.HERO_SLIDE });

      expect(result.data).toHaveLength(1);
      expect(result.data[0]).toBeInstanceOf(BannerEntity);
      expect(bannerRepositoryMock.findAllPublished).toHaveBeenCalledWith({
        placement: BannerPlacement.HERO_SLIDE,
      });
    });
  });

  describe('findAllAdmin', () => {
    it('forwards placement + status filters and returns drafts + published', async () => {
      bannerRepositoryMock.findAllAdmin.mockResolvedValue({
        banners: [mockBanner, draftBanner],
        total: 2,
      });

      const result = await service.findAllAdmin({ placement: undefined, status: undefined });

      expect(result.data).toHaveLength(2);
      expect(bannerRepositoryMock.findAllAdmin).toHaveBeenCalledWith({
        placement: undefined,
        status: undefined,
        page: undefined,
        limit: undefined,
        search: undefined,
      });
    });

    // TASK-357: an unpaginated read still reports a truthful count, so the admin panel can
    // show "N записів" without having to branch on whether it asked for pages.
    it('reports the whole list as one page when page/limit are omitted', async () => {
      bannerRepositoryMock.findAllAdmin.mockResolvedValue({
        banners: [mockBanner, draftBanner],
        total: 2,
      });

      const result = await service.findAllAdmin({});

      expect(result.meta).toEqual({ total: 2, page: 1, limit: 2, totalPages: 1 });
    });

    it('reports an empty unpaginated list without dividing by zero', async () => {
      bannerRepositoryMock.findAllAdmin.mockResolvedValue({ banners: [], total: 0 });

      const result = await service.findAllAdmin({});

      expect(result.meta).toEqual({ total: 0, page: 1, limit: 0, totalPages: 0 });
    });

    it('forwards pagination and search, and reports the page the caller asked for', async () => {
      bannerRepositoryMock.findAllAdmin.mockResolvedValue({ banners: [mockBanner], total: 12 });

      const result = await service.findAllAdmin({ page: 2, limit: 5, search: 'sale' });

      expect(bannerRepositoryMock.findAllAdmin).toHaveBeenCalledWith(
        expect.objectContaining({ page: 2, limit: 5, search: 'sale' }),
      );
      expect(result.meta).toEqual({ total: 12, page: 2, limit: 5, totalPages: 3 });
    });
  });

  describe('findByIdAdmin', () => {
    it('returns the banner when found', async () => {
      bannerRepositoryMock.findById.mockResolvedValue(draftBanner);

      const result = await service.findByIdAdmin('banner-uuid-2');

      expect(result).toBeInstanceOf(BannerEntity);
    });

    it('throws NotFoundException when not found', async () => {
      bannerRepositoryMock.findById.mockResolvedValue(null);

      await expect(service.findByIdAdmin('missing')).rejects.toThrow(NotFoundException);
    });
  });

  describe('create', () => {
    it('defaults to DRAFT (no publish, no revalidation) when status omitted', async () => {
      bannerRepositoryMock.create.mockResolvedValue(draftBanner);

      await service.create({ placement: BannerPlacement.HERO_SLIDE, title: 'Winter Teaser' });

      const passed = bannerRepositoryMock.create.mock.calls[0][0] as {
        status: PublishStatus;
        publishedAt: Date | null;
      };
      expect(passed.status).toBe(PublishStatus.DRAFT);
      expect(passed.publishedAt).toBeNull();
      expect(revalidationMock.revalidate).not.toHaveBeenCalled();
    });

    it('stamps publishedAt and revalidates the homepage when created PUBLISHED', async () => {
      bannerRepositoryMock.create.mockResolvedValue(mockBanner);

      await service.create({
        placement: BannerPlacement.HERO_SLIDE,
        title: 'Summer Sale',
        status: PublishStatus.PUBLISHED,
      });

      const passed = bannerRepositoryMock.create.mock.calls[0][0] as {
        status: PublishStatus;
        publishedAt: Date | null;
      };
      expect(passed.status).toBe(PublishStatus.PUBLISHED);
      expect(passed.publishedAt).toBeInstanceOf(Date);
      expect(revalidationMock.revalidate).toHaveBeenCalledWith({ tags: ['banners'], paths: ['/'] });
    });

    it('keeps a future SCHEDULED banner unpublished with scheduledAt set', async () => {
      bannerRepositoryMock.create.mockResolvedValue(draftBanner);
      const future = new Date(Date.now() + 86_400_000).toISOString();

      await service.create({
        placement: BannerPlacement.PROMO_TILE,
        title: 'Scheduled',
        status: PublishStatus.SCHEDULED,
        scheduledAt: future,
      });

      const passed = bannerRepositoryMock.create.mock.calls[0][0] as {
        status: PublishStatus;
        publishedAt: Date | null;
        scheduledAt: Date | null;
      };
      expect(passed.status).toBe(PublishStatus.SCHEDULED);
      expect(passed.publishedAt).toBeNull();
      expect(passed.scheduledAt).toBeInstanceOf(Date);
      expect(revalidationMock.revalidate).not.toHaveBeenCalled();
    });
  });

  describe('update', () => {
    it('throws NotFoundException when the banner is missing', async () => {
      bannerRepositoryMock.findById.mockResolvedValue(null);

      await expect(service.update('missing', { title: 'x' })).rejects.toThrow(NotFoundException);
    });

    it('does not touch publish fields when status is omitted', async () => {
      bannerRepositoryMock.findById.mockResolvedValue(mockBanner);
      bannerRepositoryMock.update.mockResolvedValue(mockBanner);

      await service.update('banner-uuid-1', { title: 'Renamed' });

      const passed = bannerRepositoryMock.update.mock.calls[0][1] as {
        status?: PublishStatus;
        publishedAt?: Date | null;
      };
      expect(passed.status).toBeUndefined();
      expect(passed.publishedAt).toBeUndefined();
    });

    it('revalidates when editing an already-PUBLISHED banner in place', async () => {
      bannerRepositoryMock.findById.mockResolvedValue(mockBanner);
      bannerRepositoryMock.update.mockResolvedValue(mockBanner);

      await service.update('banner-uuid-1', { title: 'Renamed' });

      expect(revalidationMock.revalidate).toHaveBeenCalledWith({ tags: ['banners'], paths: ['/'] });
    });

    it('does not revalidate when editing a DRAFT that stays draft', async () => {
      bannerRepositoryMock.findById.mockResolvedValue(draftBanner);
      bannerRepositoryMock.update.mockResolvedValue(draftBanner);

      await service.update('banner-uuid-2', { title: 'Renamed' });

      expect(revalidationMock.revalidate).not.toHaveBeenCalled();
    });

    it('preserves the original publishedAt when re-saving an already-PUBLISHED banner', async () => {
      bannerRepositoryMock.findById.mockResolvedValue(mockBanner);
      bannerRepositoryMock.update.mockResolvedValue(mockBanner);

      await service.update('banner-uuid-1', { status: PublishStatus.PUBLISHED });

      const passed = bannerRepositoryMock.update.mock.calls[0][1] as {
        status?: PublishStatus;
        publishedAt?: Date | null;
      };
      expect(passed.status).toBe(PublishStatus.PUBLISHED);
      expect(passed.publishedAt).toEqual(mockBanner.publishedAt);
    });
  });

  describe('publish / unpublish', () => {
    it('publish throws NotFoundException when missing', async () => {
      bannerRepositoryMock.findById.mockResolvedValue(null);
      await expect(service.publish('missing')).rejects.toThrow(NotFoundException);
    });

    it('publish sets the banner PUBLISHED and revalidates the homepage', async () => {
      bannerRepositoryMock.findById.mockResolvedValue(draftBanner);
      bannerRepositoryMock.publish.mockResolvedValue({
        ...draftBanner,
        status: PublishStatus.PUBLISHED,
      });

      const result = await service.publish('banner-uuid-2');

      expect(result.status).toBe(PublishStatus.PUBLISHED);
      expect(revalidationMock.revalidate).toHaveBeenCalledWith({ tags: ['banners'], paths: ['/'] });
    });

    it('unpublish sets the banner DRAFT and revalidates the homepage', async () => {
      bannerRepositoryMock.findById.mockResolvedValue(mockBanner);
      bannerRepositoryMock.unpublish.mockResolvedValue({
        ...mockBanner,
        status: PublishStatus.DRAFT,
      });

      const result = await service.unpublish('banner-uuid-1');

      expect(result.status).toBe(PublishStatus.DRAFT);
      expect(revalidationMock.revalidate).toHaveBeenCalledWith({ tags: ['banners'], paths: ['/'] });
    });
  });

  describe('delete', () => {
    it('throws NotFoundException when missing', async () => {
      bannerRepositoryMock.findById.mockResolvedValue(null);
      await expect(service.delete('missing')).rejects.toThrow(NotFoundException);
    });

    it('hard-deletes and revalidates when the banner was PUBLISHED', async () => {
      bannerRepositoryMock.findById.mockResolvedValue(mockBanner);
      bannerRepositoryMock.delete.mockResolvedValue(mockBanner);

      await service.delete('banner-uuid-1');

      expect(bannerRepositoryMock.delete).toHaveBeenCalledWith('banner-uuid-1');
      expect(revalidationMock.revalidate).toHaveBeenCalledWith({ tags: ['banners'], paths: ['/'] });
    });

    it('hard-deletes without revalidating when the banner was a DRAFT', async () => {
      bannerRepositoryMock.findById.mockResolvedValue(draftBanner);
      bannerRepositoryMock.delete.mockResolvedValue(draftBanner);

      await service.delete('banner-uuid-2');

      expect(bannerRepositoryMock.delete).toHaveBeenCalledWith('banner-uuid-2');
      expect(revalidationMock.revalidate).not.toHaveBeenCalled();
    });
  });

  // ─── reorderPlacement (TASK-295) ──────────────────────────────────────────

  describe('reorderPlacement', () => {
    const a = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
    const b = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

    it('returns the refreshed FULL admin list and revalidates a bucket with a live banner', async () => {
      bannerRepositoryMock.reorderPlacement.mockResolvedValue({
        banners: [mockBanner, draftBanner],
        total: 2,
      });

      const result = await service.reorderPlacement(
        { placement: BannerPlacement.HERO_SLIDE, orderedIds: [b, a] },
        'admin-1',
      );

      expect(result.data).toHaveLength(2);
      expect(result.data[0]).toBeInstanceOf(BannerEntity);
      // Shape parity with `findAllAdmin` — the panel writes this straight into the list cache.
      expect(result.meta).toEqual({ total: 2, page: 1, limit: 2, totalPages: 1 });
      expect(bannerRepositoryMock.reorderPlacement).toHaveBeenCalledWith(
        BannerPlacement.HERO_SLIDE,
        [b, a],
      );
      expect(revalidationMock.revalidate).toHaveBeenCalledWith({ tags: ['banners'], paths: ['/'] });
    });

    // A pure DRAFT shuffle changes nothing the shopper can see — same visibility gate the
    // rest of this service applies to create / update / delete.
    it('does NOT revalidate when the reordered bucket holds no PUBLISHED banner', async () => {
      bannerRepositoryMock.reorderPlacement.mockResolvedValue({
        banners: [
          draftBanner,
          // A live banner in ANOTHER placement must not trigger a revalidation of THIS drag.
          { ...mockBanner, placement: BannerPlacement.ANNOUNCEMENT_BAR },
        ],
        total: 2,
      });

      await service.reorderPlacement(
        { placement: BannerPlacement.HERO_SLIDE, orderedIds: [b] },
        'admin-1',
      );

      expect(revalidationMock.revalidate).not.toHaveBeenCalled();
    });

    it('maps a stale reorder onto a 409 carrying the stable code', async () => {
      bannerRepositoryMock.reorderPlacement.mockRejectedValue(new ReorderStaleError());

      await expect(
        service.reorderPlacement({ placement: BannerPlacement.HERO_SLIDE, orderedIds: [a] }, 'x'),
      ).rejects.toBeInstanceOf(ConflictException);

      expect(revalidationMock.revalidate).not.toHaveBeenCalled();
    });
  });
});
