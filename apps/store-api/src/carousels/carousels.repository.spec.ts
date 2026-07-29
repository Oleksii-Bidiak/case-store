import { Test, TestingModule } from '@nestjs/testing';
import { CarouselPlacement, CarouselSource, PublishStatus } from '@prisma/client';
import { PrismaService } from '../prisma';
import { CarouselRepository } from './carousels.repository';

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

const transactionMock = jest.fn();

const prismaMock = {
  carousel: {
    findMany: jest.fn(),
    count: jest.fn(),
    findUnique: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    updateMany: jest.fn(),
    delete: jest.fn(),
  },
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

    it('writes a new placement when provided', async () => {
      prismaMock.carousel.update.mockResolvedValue({
        ...mockCarousel,
        placement: CarouselPlacement.HOME_TABS,
      });

      await repository.update('carousel-uuid-1', { placement: CarouselPlacement.HOME_TABS });

      expect(prismaMock.carousel.update).toHaveBeenCalledWith({
        where: { id: 'carousel-uuid-1' },
        data: { placement: CarouselPlacement.HOME_TABS },
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
