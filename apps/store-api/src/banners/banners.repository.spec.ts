import { Test, TestingModule } from '@nestjs/testing';
import { BannerPlacement, PublishStatus } from '@prisma/client';
import { PrismaService } from '../prisma';
import { BannerRepository } from './banners.repository';
import { ReorderStaleError } from '../common/reorder';

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

/**
 * ONE banner delegate shared by the singleton client and the transaction client: the
 * repository reads/writes through `tx.banner` inside a transaction (create + reorder) and
 * through `this.prisma.banner` outside one, and the assertions do not care which.
 */
const bannerDelegate = {
  findMany: jest.fn(),
  count: jest.fn(),
  findUnique: jest.fn(),
  aggregate: jest.fn(),
  create: jest.fn(),
  update: jest.fn(),
  updateMany: jest.fn(),
  delete: jest.fn(),
};

const txMock = {
  banner: bannerDelegate,
  // `pg_advisory_xact_lock` — taken by `create` and by `reorderPlacement`.
  $executeRaw: jest.fn(),
};

const prismaMock = {
  banner: bannerDelegate,
  $transaction: jest.fn((cb: (tx: typeof txMock) => Promise<unknown>) => cb(txMock)),
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

      expect(result).toEqual({ banners: [mockBanner], total: 1 });
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

    it('matches the title case-insensitively when searching', async () => {
      prismaMock.banner.findMany.mockResolvedValue([]);

      await repository.findAllAdmin({ search: 'ЗнИж' });

      expect(prismaMock.banner.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { title: { contains: 'ЗнИж', mode: 'insensitive' } },
        }),
      );
    });

    // TASK-357: absence of page/limit is the "return everything" signal the reorder UI
    // depends on — no skip/take, and no second round-trip just to count what we already hold.
    it('skips both pagination and the count query when page and limit are absent', async () => {
      prismaMock.banner.findMany.mockResolvedValue([mockBanner]);

      await repository.findAllAdmin();

      expect(prismaMock.banner.findMany).toHaveBeenCalledWith(
        expect.not.objectContaining({ take: expect.anything() }),
      );
      expect(prismaMock.banner.count).not.toHaveBeenCalled();
    });

    it('paginates and counts once either page or limit is present', async () => {
      prismaMock.banner.findMany.mockResolvedValue([mockBanner]);
      prismaMock.banner.count.mockResolvedValue(42);

      const result = await repository.findAllAdmin({ page: 3, limit: 5 });

      expect(result).toEqual({ banners: [mockBanner], total: 42 });
      expect(prismaMock.banner.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ skip: 10, take: 5 }),
      );
    });

    it('falls back to a default page size when only page is given', async () => {
      prismaMock.banner.findMany.mockResolvedValue([]);
      prismaMock.banner.count.mockResolvedValue(0);

      await repository.findAllAdmin({ page: 2 });

      expect(prismaMock.banner.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ skip: 20, take: 20 }),
      );
    });

    // TASK-295, trap B: the admin list must be WYSIWYG. Its tiebreaker used to be
    // `createdAt: 'desc'` while the public list used `'asc'`, so while every sortOrder is
    // still 0 the operator dragged rows in the exact REVERSE of the shopper's order.
    it('tiebreaks by createdAt ASC — the same order the public list renders', async () => {
      prismaMock.banner.findMany.mockResolvedValue([]);

      await repository.findAllAdmin();

      expect(prismaMock.banner.findMany).toHaveBeenCalledWith({
        where: {},
        orderBy: [{ placement: 'asc' }, { sortOrder: 'asc' }, { createdAt: 'asc' }],
      });
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
      prismaMock.banner.aggregate.mockResolvedValue({ _max: { sortOrder: null } });
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
          // First banner in an EMPTY bucket — slot 0.
          sortOrder: 0,
        }),
      });
    });

    // TASK-295, trap A: with the hand-typed `sortOrder` field gone from the admin form,
    // the old `?? 0` default would stack every new banner ON TOP OF the first one.
    it('APPENDS a new banner to the end of its placement bucket (max + 1)', async () => {
      prismaMock.banner.aggregate.mockResolvedValue({ _max: { sortOrder: 4 } });
      prismaMock.banner.create.mockResolvedValue(mockBanner);

      await repository.create({
        placement: BannerPlacement.HERO_SLIDE,
        title: 'Autumn Sale',
        status: PublishStatus.DRAFT,
        publishedAt: null,
        scheduledAt: null,
      });

      // The max is read per PLACEMENT, under that placement's advisory lock.
      expect(txMock.$executeRaw).toHaveBeenCalledTimes(1);
      expect(prismaMock.banner.aggregate).toHaveBeenCalledWith({
        where: { placement: BannerPlacement.HERO_SLIDE },
        _max: { sortOrder: true },
      });
      expect(prismaMock.banner.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ sortOrder: 5 }),
      });
    });

    it('honours an EXPLICIT sortOrder without reading the bucket max', async () => {
      prismaMock.banner.create.mockResolvedValue(mockBanner);

      await repository.create({
        placement: BannerPlacement.HERO_SLIDE,
        title: 'Pinned',
        sortOrder: 2,
        status: PublishStatus.DRAFT,
        publishedAt: null,
        scheduledAt: null,
      });

      expect(prismaMock.banner.aggregate).not.toHaveBeenCalled();
      expect(prismaMock.banner.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ sortOrder: 2 }),
      });
    });
  });

  // ─── reorderPlacement (TASK-295) ──────────────────────────────────────────

  describe('reorderPlacement', () => {
    const a = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
    const b = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

    it('locks the placement, writes index → sortOrder scoped to it, returns the full list', async () => {
      // 1st findMany = the in-tx snapshot; 2nd = the refreshed FULL admin list.
      prismaMock.banner.findMany
        .mockResolvedValueOnce([{ id: a }, { id: b }])
        .mockResolvedValueOnce([mockBanner]);

      const result = await repository.reorderPlacement(BannerPlacement.HERO_SLIDE, [b, a]);

      expect(result).toEqual({ banners: [mockBanner], total: 1 });
      expect(txMock.$executeRaw).toHaveBeenCalledTimes(1);

      // `scope: { placement }` — an id forged from another placement updates nothing.
      expect(prismaMock.banner.updateMany).toHaveBeenNthCalledWith(1, {
        where: { id: b, placement: BannerPlacement.HERO_SLIDE },
        data: { sortOrder: 0 },
      });
      expect(prismaMock.banner.updateMany).toHaveBeenNthCalledWith(2, {
        where: { id: a, placement: BannerPlacement.HERO_SLIDE },
        data: { sortOrder: 1 },
      });

      // The refreshed list is the FULL admin list (all placements), read in-transaction.
      expect(prismaMock.banner.findMany).toHaveBeenLastCalledWith({
        where: {},
        orderBy: [{ placement: 'asc' }, { sortOrder: 'asc' }, { createdAt: 'asc' }],
      });
    });

    it('rejects a payload that does not cover the whole bucket (STALE) and writes nothing', async () => {
      prismaMock.banner.findMany.mockResolvedValueOnce([{ id: a }, { id: b }]);

      await expect(
        repository.reorderPlacement(BannerPlacement.HERO_SLIDE, [a]),
      ).rejects.toBeInstanceOf(ReorderStaleError);

      expect(prismaMock.banner.updateMany).not.toHaveBeenCalled();
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
