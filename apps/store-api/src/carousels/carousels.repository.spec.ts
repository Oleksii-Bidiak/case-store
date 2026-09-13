import { Test, TestingModule } from '@nestjs/testing';
import { CarouselPlacement, CarouselSource, PublishStatus } from '@prisma/client';
import { PrismaService } from '../prisma';
import { CarouselRepository } from './carousels.repository';
import { ReorderStaleError } from '../common/reorder';

const mockCarousel = {
  id: 'carousel-uuid-1',
  title: 'Хіти продажів',
  source: CarouselSource.BESTSELLING,
  categoryId: null,
  itemLimit: 12,
  placement: CarouselPlacement.HOME_RAILS,
  sortOrder: 0,
  status: PublishStatus.PUBLISHED,
  publishedAt: new Date('2026-07-01T00:00:00.000Z'),
  scheduledAt: null,
  createdAt: new Date('2026-07-01T00:00:00.000Z'),
  updatedAt: new Date('2026-07-01T00:00:00.000Z'),
};

/**
 * ONE carousel delegate shared by the singleton client and the transaction client: the
 * repository reads/writes through `tx.carousel` inside a transaction (create + reorder)
 * and through `this.prisma.carousel` outside one, and the assertions do not care which.
 */
const carouselDelegate = {
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
  carousel: carouselDelegate,
  // `pg_advisory_xact_lock` — taken by `create` and by `reorderPlacement`.
  $executeRaw: jest.fn(),
};

const transactionMock = jest.fn();

const prismaMock = {
  carousel: carouselDelegate,
  carouselItem: {
    findMany: jest.fn(),
    deleteMany: jest.fn(),
    createMany: jest.fn(),
  },
  $transaction: transactionMock,
};

describe('CarouselRepository', () => {
  let repository: CarouselRepository;

  beforeEach(async () => {
    jest.clearAllMocks();

    // `$transaction` serves BOTH shapes: the INTERACTIVE callback form (`create`,
    // `reorderPlacement`) and the BATCH-ARRAY form (`replaceItems`). Re-established on
    // every test so a `mockResolvedValue` inside one case cannot leak into the next.
    transactionMock.mockImplementation((arg: unknown) =>
      typeof arg === 'function'
        ? (arg as (tx: typeof txMock) => Promise<unknown>)(txMock)
        : Promise.resolve([]),
    );

    const module: TestingModule = await Test.createTestingModule({
      providers: [CarouselRepository, { provide: PrismaService, useValue: prismaMock }],
    }).compile();

    repository = module.get<CarouselRepository>(CarouselRepository);
  });

  describe('findAllPublished', () => {
    it('returns only PUBLISHED carousels ordered by sortOrder then createdAt', async () => {
      prismaMock.carousel.findMany.mockResolvedValue([mockCarousel]);

      const result = await repository.findAllPublished();

      expect(result).toEqual([mockCarousel]);
      expect(prismaMock.carousel.findMany).toHaveBeenCalledWith({
        where: { status: PublishStatus.PUBLISHED },
        orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
      });
    });

    it('applies the placement filter when provided (TASK-288)', async () => {
      prismaMock.carousel.findMany.mockResolvedValue([]);

      await repository.findAllPublished({ placement: CarouselPlacement.HOME_TABS });

      expect(prismaMock.carousel.findMany).toHaveBeenCalledWith({
        where: { status: PublishStatus.PUBLISHED, placement: CarouselPlacement.HOME_TABS },
        orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
      });
    });

    it('omits the placement filter when it is undefined (unscoped read stays intact)', async () => {
      prismaMock.carousel.findMany.mockResolvedValue([]);

      await repository.findAllPublished({ placement: undefined });

      expect(prismaMock.carousel.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { status: PublishStatus.PUBLISHED } }),
      );
    });
  });

  describe('findAllAdmin', () => {
    it('returns all carousels when no filters are given', async () => {
      prismaMock.carousel.findMany.mockResolvedValue([mockCarousel]);

      const result = await repository.findAllAdmin();

      expect(result).toEqual({ carousels: [mockCarousel], total: 1 });
      expect(prismaMock.carousel.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: {} }),
      );
    });

    it('applies the status filter when provided', async () => {
      prismaMock.carousel.findMany.mockResolvedValue([]);

      await repository.findAllAdmin({ status: PublishStatus.DRAFT });

      expect(prismaMock.carousel.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { status: PublishStatus.DRAFT } }),
      );
    });

    it('applies placement and status filters together when provided', async () => {
      prismaMock.carousel.findMany.mockResolvedValue([]);

      await repository.findAllAdmin({
        placement: CarouselPlacement.HOME_TABS,
        status: PublishStatus.PUBLISHED,
      });

      expect(prismaMock.carousel.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            placement: CarouselPlacement.HOME_TABS,
            status: PublishStatus.PUBLISHED,
          },
        }),
      );
    });

    it('matches the title case-insensitively when searching', async () => {
      prismaMock.carousel.findMany.mockResolvedValue([]);

      await repository.findAllAdmin({ search: 'НоВиН' });

      expect(prismaMock.carousel.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { title: { contains: 'НоВиН', mode: 'insensitive' } },
        }),
      );
    });

    // TASK-357: absence of page/limit is the "return everything" signal — no skip/take, and
    // no second round-trip just to count rows we already hold.
    it('skips both pagination and the count query when page and limit are absent', async () => {
      prismaMock.carousel.findMany.mockResolvedValue([mockCarousel]);

      await repository.findAllAdmin();

      expect(prismaMock.carousel.findMany).toHaveBeenCalledWith(
        expect.not.objectContaining({ take: expect.anything() }),
      );
      expect(prismaMock.carousel.count).not.toHaveBeenCalled();
    });

    it('paginates and counts once either page or limit is present', async () => {
      prismaMock.carousel.findMany.mockResolvedValue([mockCarousel]);
      prismaMock.carousel.count.mockResolvedValue(9);

      const result = await repository.findAllAdmin({ page: 2, limit: 4 });

      expect(result).toEqual({ carousels: [mockCarousel], total: 9 });
      expect(prismaMock.carousel.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ skip: 4, take: 4 }),
      );
    });
  });

  describe('findById', () => {
    it('looks up by id with no status filter', async () => {
      prismaMock.carousel.findUnique.mockResolvedValue(mockCarousel);

      const result = await repository.findById('carousel-uuid-1');

      expect(result).toBe(mockCarousel);
      expect(prismaMock.carousel.findUnique).toHaveBeenCalledWith({
        where: { id: 'carousel-uuid-1' },
      });
    });
  });

  describe('create', () => {
    it('persists the carousel with resolved publish fields and defaults', async () => {
      prismaMock.carousel.aggregate.mockResolvedValue({ _max: { sortOrder: null } });
      prismaMock.carousel.create.mockResolvedValue(mockCarousel);

      await repository.create({
        title: 'Хіти продажів',
        source: CarouselSource.BESTSELLING,
        status: PublishStatus.PUBLISHED,
        publishedAt: mockCarousel.publishedAt,
        scheduledAt: null,
      });

      expect(prismaMock.carousel.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          title: 'Хіти продажів',
          source: CarouselSource.BESTSELLING,
          categoryId: null,
          itemLimit: 12,
          placement: CarouselPlacement.HOME_RAILS,
          sortOrder: 0,
          status: PublishStatus.PUBLISHED,
          publishedAt: mockCarousel.publishedAt,
          scheduledAt: null,
        }),
      });
    });

    it('persists an explicit placement (TASK-288)', async () => {
      prismaMock.carousel.aggregate.mockResolvedValue({ _max: { sortOrder: null } });
      prismaMock.carousel.create.mockResolvedValue(mockCarousel);

      await repository.create({
        title: 'Хіти продажів',
        source: CarouselSource.BESTSELLING,
        placement: CarouselPlacement.HOME_TABS,
        status: PublishStatus.PUBLISHED,
        publishedAt: mockCarousel.publishedAt,
        scheduledAt: null,
      });

      expect(prismaMock.carousel.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ placement: CarouselPlacement.HOME_TABS }),
      });
    });

    // TASK-428: the whole point of the change — a new carousel lands at the END of ITS
    // placement bucket, not on top of the first one.
    it('appends to the end of the TARGET PLACEMENT bucket (max + 1) under that bucket lock', async () => {
      prismaMock.carousel.aggregate.mockResolvedValue({ _max: { sortOrder: 2 } });
      prismaMock.carousel.create.mockResolvedValue({ ...mockCarousel, sortOrder: 3 });

      await repository.create({
        title: 'Нові надходження',
        source: CarouselSource.NEWEST,
        placement: CarouselPlacement.HOME_TABS,
        status: PublishStatus.DRAFT,
        publishedAt: null,
        scheduledAt: null,
      });

      // The max read MUST happen inside the locked transaction, or two concurrent
      // appends both read the same max and collide on one slot. And it must be scoped
      // to the bucket — the other placement's numbers are irrelevant.
      expect(txMock.$executeRaw).toHaveBeenCalledTimes(1);
      expect(prismaMock.carousel.aggregate).toHaveBeenCalledWith({
        where: { placement: CarouselPlacement.HOME_TABS },
        _max: { sortOrder: true },
      });
      expect(prismaMock.carousel.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          sortOrder: 3,
          placement: CarouselPlacement.HOME_TABS,
        }),
      });
    });

    it('honours an explicit sortOrder without reading max', async () => {
      prismaMock.carousel.create.mockResolvedValue({ ...mockCarousel, sortOrder: 9 });

      await repository.create({
        title: 'X',
        source: CarouselSource.NEWEST,
        sortOrder: 9,
        status: PublishStatus.DRAFT,
        publishedAt: null,
        scheduledAt: null,
      });

      expect(prismaMock.carousel.aggregate).not.toHaveBeenCalled();
      expect(prismaMock.carousel.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ sortOrder: 9 }),
      });
    });
  });

  // ─── reorderPlacement (TASK-428) ───────────────────────────────────────────

  describe('reorderPlacement', () => {
    const a = 'carousel-uuid-1';
    const b = 'carousel-uuid-2';

    it('locks the bucket, writes the index as sortOrder and scopes every write to it', async () => {
      prismaMock.carousel.findMany
        // 1) the in-transaction snapshot of the bucket's membership
        .mockResolvedValueOnce([{ id: a }, { id: b }])
        // 2) the refreshed admin list (ALL placements), read in the same transaction
        .mockResolvedValueOnce([
          { ...mockCarousel, id: b, sortOrder: 0 },
          { ...mockCarousel, sortOrder: 1 },
        ]);

      const result = await repository.reorderPlacement(CarouselPlacement.HOME_RAILS, [b, a]);

      expect(result.total).toBe(2);
      expect(txMock.$executeRaw).toHaveBeenCalledTimes(1);
      expect(prismaMock.carousel.findMany).toHaveBeenNthCalledWith(1, {
        where: { placement: CarouselPlacement.HOME_RAILS },
        select: { id: true },
      });
      // `placement` in the WHERE is the safety net: an id forged from the OTHER
      // placement silently updates nothing instead of being stolen into this bucket.
      expect(prismaMock.carousel.updateMany).toHaveBeenNthCalledWith(1, {
        where: { id: b, placement: CarouselPlacement.HOME_RAILS },
        data: { sortOrder: 0 },
      });
      expect(prismaMock.carousel.updateMany).toHaveBeenNthCalledWith(2, {
        where: { id: a, placement: CarouselPlacement.HOME_RAILS },
        data: { sortOrder: 1 },
      });
    });

    it('rejects a PARTIAL ordering (a row appeared underneath the client) as stale', async () => {
      prismaMock.carousel.findMany.mockResolvedValueOnce([{ id: a }, { id: b }]);

      await expect(
        repository.reorderPlacement(CarouselPlacement.HOME_RAILS, [a]),
      ).rejects.toBeInstanceOf(ReorderStaleError);
      expect(prismaMock.carousel.updateMany).not.toHaveBeenCalled();
    });
  });

  describe('update', () => {
    it('forwards partial data as-is', async () => {
      prismaMock.carousel.update.mockResolvedValue(mockCarousel);

      await repository.update('carousel-uuid-1', { title: 'Renamed' });

      expect(prismaMock.carousel.update).toHaveBeenCalledWith({
        where: { id: 'carousel-uuid-1' },
        data: { title: 'Renamed' },
      });
    });

    // The in-place write forwards `placement` verbatim — correct ONLY when it equals the
    // stored one (the admin form re-sends the current placement on every save). A real
    // MOVE goes through `updateWithPlacementMove`; see the describe below.
    it('forwards a placement verbatim, taking no lock and reading no max', async () => {
      prismaMock.carousel.update.mockResolvedValue({
        ...mockCarousel,
        placement: CarouselPlacement.HOME_TABS,
      });

      await repository.update('carousel-uuid-1', { placement: CarouselPlacement.HOME_TABS });

      expect(prismaMock.carousel.update).toHaveBeenCalledWith({
        where: { id: 'carousel-uuid-1' },
        data: { placement: CarouselPlacement.HOME_TABS },
      });
      expect(txMock.$executeRaw).not.toHaveBeenCalled();
      expect(prismaMock.carousel.aggregate).not.toHaveBeenCalled();
    });
  });

  // ─── updateWithPlacementMove ───────────────────────────────────────────────

  describe('updateWithPlacementMove', () => {
    // The bug this method exists for: a plain `update` carried the row's OLD slot into the
    // new bucket, so HOME_TABS (0,1,2) gained a SECOND row at 0 and the homepage ordered
    // the pair by createdAt — the moved carousel surfacing in a position nobody chose.
    it('re-appends the moved carousel to the END of the TARGET bucket (max + 1)', async () => {
      prismaMock.carousel.aggregate.mockResolvedValue({ _max: { sortOrder: 2 } });
      prismaMock.carousel.update.mockResolvedValue({
        ...mockCarousel,
        placement: CarouselPlacement.HOME_TABS,
        sortOrder: 3,
      });

      await repository.updateWithPlacementMove(
        'carousel-uuid-1',
        { title: 'Renamed', placement: CarouselPlacement.HOME_TABS },
        CarouselPlacement.HOME_TABS,
      );

      // The max is read for the TARGET bucket, never the source one — the two placements
      // are independent sequences and the source's numbers say nothing about the target's.
      expect(prismaMock.carousel.aggregate).toHaveBeenCalledWith({
        where: { placement: CarouselPlacement.HOME_TABS },
        _max: { sortOrder: true },
      });
      expect(prismaMock.carousel.update).toHaveBeenCalledWith({
        where: { id: 'carousel-uuid-1' },
        data: { title: 'Renamed', placement: CarouselPlacement.HOME_TABS, sortOrder: 3 },
      });
    });

    // Without the lock, a move and a concurrent create both read the same max and write the
    // same slot — the very collision the re-append is here to prevent.
    it('takes the TARGET bucket lock before reading max, inside one transaction', async () => {
      prismaMock.carousel.aggregate.mockResolvedValue({ _max: { sortOrder: 0 } });
      prismaMock.carousel.update.mockResolvedValue(mockCarousel);

      await repository.updateWithPlacementMove(
        'carousel-uuid-1',
        { placement: CarouselPlacement.HOME_TABS },
        CarouselPlacement.HOME_TABS,
      );

      expect(transactionMock).toHaveBeenCalledTimes(1);
      expect(txMock.$executeRaw).toHaveBeenCalledTimes(1);
      const lockCallOrder = txMock.$executeRaw.mock.invocationCallOrder[0];
      const maxCallOrder = prismaMock.carousel.aggregate.mock.invocationCallOrder[0];
      expect(lockCallOrder).toBeLessThan(maxCallOrder);
    });

    it('starts an EMPTY target bucket at 0', async () => {
      prismaMock.carousel.aggregate.mockResolvedValue({ _max: { sortOrder: null } });
      prismaMock.carousel.update.mockResolvedValue(mockCarousel);

      await repository.updateWithPlacementMove(
        'carousel-uuid-1',
        { placement: CarouselPlacement.HOME_TABS },
        CarouselPlacement.HOME_TABS,
      );

      expect(prismaMock.carousel.update).toHaveBeenCalledWith({
        where: { id: 'carousel-uuid-1' },
        data: { placement: CarouselPlacement.HOME_TABS, sortOrder: 0 },
      });
    });

    it('honours an explicit sortOrder without reading max (same rule as create)', async () => {
      prismaMock.carousel.update.mockResolvedValue(mockCarousel);

      await repository.updateWithPlacementMove(
        'carousel-uuid-1',
        { placement: CarouselPlacement.HOME_TABS, sortOrder: 9 },
        CarouselPlacement.HOME_TABS,
      );

      expect(prismaMock.carousel.aggregate).not.toHaveBeenCalled();
      expect(prismaMock.carousel.update).toHaveBeenCalledWith({
        where: { id: 'carousel-uuid-1' },
        data: { placement: CarouselPlacement.HOME_TABS, sortOrder: 9 },
      });
    });
  });

  describe('publish / unpublish', () => {
    it('publish sets status PUBLISHED, stamps publishedAt, clears scheduledAt', async () => {
      prismaMock.carousel.update.mockResolvedValue(mockCarousel);
      const now = new Date('2026-07-05T00:00:00.000Z');

      await repository.publish('carousel-uuid-1', now);

      expect(prismaMock.carousel.update).toHaveBeenCalledWith({
        where: { id: 'carousel-uuid-1' },
        data: {
          status: PublishStatus.PUBLISHED,
          publishedAt: now,
          scheduledAt: null,
        },
      });
    });

    it('unpublish sets status DRAFT and clears timestamps', async () => {
      prismaMock.carousel.update.mockResolvedValue({
        ...mockCarousel,
        status: PublishStatus.DRAFT,
      });

      await repository.unpublish('carousel-uuid-1');

      expect(prismaMock.carousel.update).toHaveBeenCalledWith({
        where: { id: 'carousel-uuid-1' },
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
      prismaMock.carousel.updateMany.mockResolvedValue({ count: 2 });
      const now = new Date('2026-07-05T12:00:00.000Z');

      const count = await repository.publishDue(now);

      expect(count).toBe(2);
      expect(prismaMock.carousel.updateMany).toHaveBeenCalledWith({
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
    it('exposes the carousels homepage cache target for the scheduler', () => {
      expect(repository.revalidateTarget).toEqual({ tags: ['carousels'], paths: ['/'] });
    });
  });

  describe('delete', () => {
    it('hard-deletes by id', async () => {
      prismaMock.carousel.delete.mockResolvedValue(mockCarousel);

      await repository.delete('carousel-uuid-1');

      expect(prismaMock.carousel.delete).toHaveBeenCalledWith({
        where: { id: 'carousel-uuid-1' },
      });
    });
  });

  describe('findItemIds', () => {
    it('selects productId + sortOrder ordered by sortOrder asc', async () => {
      prismaMock.carouselItem.findMany.mockResolvedValue([
        { productId: 'product-1', sortOrder: 0 },
      ]);

      const result = await repository.findItemIds('carousel-uuid-1');

      expect(result).toEqual([{ productId: 'product-1', sortOrder: 0 }]);
      expect(prismaMock.carouselItem.findMany).toHaveBeenCalledWith({
        where: { carouselId: 'carousel-uuid-1' },
        select: { productId: true, sortOrder: true },
        orderBy: { sortOrder: 'asc' },
      });
    });
  });

  describe('findItemsWithProducts', () => {
    it('joins a minimal product summary with a single primary-first image', async () => {
      prismaMock.carouselItem.findMany.mockResolvedValue([]);

      await repository.findItemsWithProducts('carousel-uuid-1');

      expect(prismaMock.carouselItem.findMany).toHaveBeenCalledWith({
        where: { carouselId: 'carousel-uuid-1' },
        orderBy: { sortOrder: 'asc' },
        select: {
          id: true,
          productId: true,
          sortOrder: true,
          product: {
            select: {
              id: true,
              name: true,
              price: true,
              isActive: true,
              images: {
                select: { url: true },
                orderBy: [{ isPrimary: 'desc' }, { sortOrder: 'asc' }],
                take: 1,
              },
            },
          },
        },
      });
    });
  });

  describe('replaceItems', () => {
    it('deletes then recreates the item set in one transaction', async () => {
      transactionMock.mockResolvedValue([]);
      prismaMock.carouselItem.deleteMany.mockReturnValue('delete-op');
      prismaMock.carouselItem.createMany.mockReturnValue('create-op');

      await repository.replaceItems('carousel-uuid-1', [
        { productId: 'product-1', sortOrder: 0 },
        { productId: 'product-2', sortOrder: 1 },
      ]);

      expect(prismaMock.carouselItem.deleteMany).toHaveBeenCalledWith({
        where: { carouselId: 'carousel-uuid-1' },
      });
      expect(prismaMock.carouselItem.createMany).toHaveBeenCalledWith({
        data: [
          { carouselId: 'carousel-uuid-1', productId: 'product-1', sortOrder: 0 },
          { carouselId: 'carousel-uuid-1', productId: 'product-2', sortOrder: 1 },
        ],
      });
      expect(transactionMock).toHaveBeenCalledWith(['delete-op', 'create-op']);
    });

    it('clears to empty without issuing a createMany', async () => {
      transactionMock.mockResolvedValue([]);
      prismaMock.carouselItem.deleteMany.mockReturnValue('delete-op');

      await repository.replaceItems('carousel-uuid-1', []);

      expect(prismaMock.carouselItem.createMany).not.toHaveBeenCalled();
      expect(transactionMock).toHaveBeenCalledWith(['delete-op']);
    });
  });
});
