import { Test, TestingModule } from '@nestjs/testing';
import { BannerPlacement, PublishStatus } from '@prisma/client';
import { PrismaService } from '../prisma';
import { BannerRepository } from './banners.repository';

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

const prismaMock = {
  banner: {
    findMany: jest.fn(),
    findUnique: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    updateMany: jest.fn(),
    delete: jest.fn(),
  },
};

describe('BannerRepository', () => {
  let repository: BannerRepository;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [BannerRepository, { provide: PrismaService, useValue: prismaMock }],
    }).compile();

    repository = module.get<BannerRepository>(BannerRepository);
  });

  describe('findAllPublished', () => {
    it('returns only PUBLISHED banners ordered by placement then sortOrder', async () => {
      prismaMock.banner.findMany.mockResolvedValue([mockBanner]);

      const result = await repository.findAllPublished();

      expect(result).toEqual([mockBanner]);
      expect(prismaMock.banner.findMany).toHaveBeenCalledWith({
        where: { status: PublishStatus.PUBLISHED },
        orderBy: [{ placement: 'asc' }, { sortOrder: 'asc' }, { createdAt: 'asc' }],
      });
    });

    it('applies the placement filter when provided', async () => {
      prismaMock.banner.findMany.mockResolvedValue([]);

      await repository.findAllPublished({ placement: BannerPlacement.PROMO_TILE });

      expect(prismaMock.banner.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { status: PublishStatus.PUBLISHED, placement: BannerPlacement.PROMO_TILE },
        }),
      );
    });
  });

  describe('findAllAdmin', () => {
    it('returns all banners when no filters are given', async () => {
      prismaMock.banner.findMany.mockResolvedValue([mockBanner]);

      const result = await repository.findAllAdmin();

      expect(result).toEqual([mockBanner]);
      expect(prismaMock.banner.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: {} }),
      );
    });

    it('applies placement and status filters when provided', async () => {
      prismaMock.banner.findMany.mockResolvedValue([]);

      await repository.findAllAdmin({
        placement: BannerPlacement.ANNOUNCEMENT_BAR,
        status: PublishStatus.DRAFT,
      });

      expect(prismaMock.banner.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            placement: BannerPlacement.ANNOUNCEMENT_BAR,
            status: PublishStatus.DRAFT,
          },
        }),
      );
    });
  });

  describe('findById', () => {
    it('looks up by id with no status filter', async () => {
      prismaMock.banner.findUnique.mockResolvedValue(mockBanner);

      const result = await repository.findById('banner-uuid-1');

      expect(result).toBe(mockBanner);
      expect(prismaMock.banner.findUnique).toHaveBeenCalledWith({
        where: { id: 'banner-uuid-1' },
      });
    });
  });

  describe('create', () => {
    it('persists the banner with resolved publish fields', async () => {
      prismaMock.banner.create.mockResolvedValue(mockBanner);

      await repository.create({
        placement: BannerPlacement.HERO_SLIDE,
        title: 'Summer Sale',
        status: PublishStatus.PUBLISHED,
        publishedAt: mockBanner.publishedAt,
        scheduledAt: null,
      });

      expect(prismaMock.banner.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          placement: BannerPlacement.HERO_SLIDE,
          title: 'Summer Sale',
          status: PublishStatus.PUBLISHED,
          publishedAt: mockBanner.publishedAt,
          scheduledAt: null,
          sortOrder: 0,
        }),
      });
    });
  });

  describe('update', () => {
    it('forwards partial data as-is', async () => {
      prismaMock.banner.update.mockResolvedValue(mockBanner);

      await repository.update('banner-uuid-1', { title: 'Renamed' });

      expect(prismaMock.banner.update).toHaveBeenCalledWith({
        where: { id: 'banner-uuid-1' },
        data: { title: 'Renamed' },
      });
    });
  });

  describe('publish / unpublish', () => {
    it('publish sets status PUBLISHED, stamps publishedAt, clears scheduledAt', async () => {
      prismaMock.banner.update.mockResolvedValue(mockBanner);
      const now = new Date('2026-07-05T00:00:00.000Z');

      await repository.publish('banner-uuid-1', now);

      expect(prismaMock.banner.update).toHaveBeenCalledWith({
        where: { id: 'banner-uuid-1' },
        data: {
          status: PublishStatus.PUBLISHED,
          publishedAt: now,
          scheduledAt: null,
        },
      });
    });

    it('unpublish sets status DRAFT and clears timestamps', async () => {
      prismaMock.banner.update.mockResolvedValue({ ...mockBanner, status: PublishStatus.DRAFT });

      await repository.unpublish('banner-uuid-1');

      expect(prismaMock.banner.update).toHaveBeenCalledWith({
        where: { id: 'banner-uuid-1' },
        data: {
          status: PublishStatus.DRAFT,
          publishedAt: null,
          scheduledAt: null,
        },
      });
    });
  });

  describe('publishDue', () => {
    it('flips due SCHEDULED rows to PUBLISHED and returns the count', async () => {
      prismaMock.banner.updateMany.mockResolvedValue({ count: 2 });
      const now = new Date('2026-07-05T12:00:00.000Z');

      const count = await repository.publishDue(now);

      expect(count).toBe(2);
      expect(prismaMock.banner.updateMany).toHaveBeenCalledWith({
        where: { status: PublishStatus.SCHEDULED, scheduledAt: { lte: now } },
        data: {
          status: PublishStatus.PUBLISHED,
          publishedAt: now,
          scheduledAt: null,
        },
      });
    });
  });

  describe('revalidateTarget', () => {
    it('exposes the banners homepage cache target for the scheduler', () => {
      expect(repository.revalidateTarget).toEqual({ tags: ['banners'], paths: ['/'] });
    });
  });

  describe('delete', () => {
    it('hard-deletes by id', async () => {
      prismaMock.banner.delete.mockResolvedValue(mockBanner);

      await repository.delete('banner-uuid-1');

      expect(prismaMock.banner.delete).toHaveBeenCalledWith({ where: { id: 'banner-uuid-1' } });
    });
  });
});
