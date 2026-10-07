import { Test, TestingModule } from '@nestjs/testing';
import { CarouselSource, PublishStatus } from '@prisma/client';
import { PrismaService } from '../prisma';
import { CarouselRepository } from './carousels.repository';
import { ReorderStaleError } from '../common/reorder';

const mockCarousel = {
  id: 'carousel-uuid-1',
  title: 'Хіти продажів',
  source: CarouselSource.BESTSELLING,
  categoryId: null,
  itemLimit: 12,
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
  // `pg_advisory_xact_lock` — taken by `create` and by `reorder`.
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
    // `reorder`) and the BATCH-ARRAY form (`replaceItems`). Re-established on
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

    // TASK-660: one global list — ordered by sortOrder alone, no placement grouping.
    it('orders the admin list by sortOrder then createdAt', async () => {
      prismaMock.carousel.findMany.mockResolvedValue([]);

      await repository.findAllAdmin();

      expect(prismaMock.carousel.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }] }),
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
          sortOrder: 0,
          status: PublishStatus.PUBLISHED,
          publishedAt: mockCarousel.publishedAt,
          scheduledAt: null,
        }),
      });
      // TASK-660: there is no placement to persist any more.
      expect(prismaMock.carousel.create.mock.calls[0][0].data).not.toHaveProperty('placement');
    });

    // TASK-428: the whole point of the change — a new carousel lands at the END of the
    // list, not on top of the first one. One global list since TASK-660.
    it('appends to the end of the list (max + 1) under the list lock', async () => {
      prismaMock.carousel.aggregate.mockResolvedValue({ _max: { sortOrder: 2 } });
      prismaMock.carousel.create.mockResolvedValue({ ...mockCarousel, sortOrder: 3 });

      await repository.create({
        title: 'Нові надходження',
        source: CarouselSource.NEWEST,
        status: PublishStatus.DRAFT,
        publishedAt: null,
        scheduledAt: null,
      });

      // The max read MUST happen inside the locked transaction, or two concurrent
      // appends both read the same max and collide on one slot.
      expect(txMock.$executeRaw).toHaveBeenCalledTimes(1);
      const lockCallOrder = txMock.$executeRaw.mock.invocationCallOrder[0];
      const maxCallOrder = prismaMock.carousel.aggregate.mock.invocationCallOrder[0];
      expect(lockCallOrder).toBeLessThan(maxCallOrder);
      expect(prismaMock.carousel.aggregate).toHaveBeenCalledWith({
        _max: { sortOrder: true },
      });
      expect(prismaMock.carousel.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ sortOrder: 3 }),
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

  // ─── reorder (TASK-428; one global list since TASK-660) ────────────────────

  describe('reorder', () => {
    const a = 'carousel-uuid-1';
    const b = 'carousel-uuid-2';

    it('locks the list, snapshots EVERY carousel and writes the index as sortOrder', async () => {
      prismaMock.carousel.findMany
        // 1) the in-transaction snapshot of the list's membership + current slots
        .mockResolvedValueOnce([
          { id: a, sortOrder: 0 },
          { id: b, sortOrder: 1 },
        ])
        // 2) the refreshed admin list, read in the same transaction
        .mockResolvedValueOnce([
          { ...mockCarousel, id: b, sortOrder: 0 },
          { ...mockCarousel, sortOrder: 1 },
        ]);

      const result = await repository.reorder([b, a]);

      expect(result.total).toBe(2);
      expect(txMock.$executeRaw).toHaveBeenCalledTimes(1);
      expect(prismaMock.carousel.findMany).toHaveBeenNthCalledWith(1, {
        select: { id: true, sortOrder: true },
      });
      expect(prismaMock.carousel.updateMany).toHaveBeenNthCalledWith(1, {
        where: { id: b },
        data: { sortOrder: 0 },
      });
      expect(prismaMock.carousel.updateMany).toHaveBeenNthCalledWith(2, {
        where: { id: a },
        data: { sortOrder: 1 },
      });
    });

    it('rejects a PARTIAL ordering (a row appeared underneath the client) as stale', async () => {
      prismaMock.carousel.findMany.mockResolvedValueOnce([{ id: a }, { id: b }]);

      await expect(repository.reorder([a])).rejects.toBeInstanceOf(ReorderStaleError);
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
      expect(txMock.$executeRaw).not.toHaveBeenCalled();
    });
  });

  describe('findByIds', () => {
    it('reads the named carousels in one query, any status', async () => {
      prismaMock.carousel.findMany.mockResolvedValue([mockCarousel]);

      const result = await repository.findByIds(['carousel-uuid-1', 'carousel-uuid-2']);

      expect(result).toEqual([mockCarousel]);
      expect(prismaMock.carousel.findMany).toHaveBeenCalledWith({
        where: { id: { in: ['carousel-uuid-1', 'carousel-uuid-2'] } },
      });
    });

    it('skips the query for an empty id list', async () => {
      await expect(repository.findByIds([])).resolves.toEqual([]);
      expect(prismaMock.carousel.findMany).not.toHaveBeenCalled();
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
    it('exposes the carousels + home-blocks homepage cache target for the scheduler', () => {
      expect(repository.revalidateTarget).toEqual({
        tags: ['carousels', 'home-blocks'],
        paths: ['/'],
      });
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
