import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { CarouselPlacement, CarouselSource, PublishStatus } from '@prisma/client';
import { CarouselRepository } from './carousels.repository';
import { CarouselService } from './carousels.service';
import { CarouselEntity, CarouselItemEntity, PublicCarouselEntity } from './entities';
import { ProductService } from '../product/product.service';
import { ProductListQueryDto } from '../product/dto';
import { CategoryRepository } from '../category';
import { RevalidationNotifier } from '../publishing';

const baseCarousel = {
  id: 'carousel-uuid-1',
  title: 'Хіти продажів',
  source: CarouselSource.BESTSELLING,
  categoryId: null as string | null,
  itemLimit: 12,
  placement: CarouselPlacement.HOME_RAILS,
  sortOrder: 0,
  status: PublishStatus.PUBLISHED,
  publishedAt: new Date('2026-07-01T00:00:00.000Z'),
  scheduledAt: null,
  createdAt: new Date('2026-07-01T00:00:00.000Z'),
  updatedAt: new Date('2026-07-01T00:00:00.000Z'),
};

const draftCarousel = {
  ...baseCarousel,
  id: 'carousel-uuid-2',
  title: 'Чернетка',
  status: PublishStatus.DRAFT,
  publishedAt: null,
};

const productCard = { id: 'product-1', name: 'Case', slug: 'case' };

const carouselRepositoryMock = {
  findAllPublished: jest.fn(),
  findAllAdmin: jest.fn(),
  findById: jest.fn(),
  create: jest.fn(),
  update: jest.fn(),
  publish: jest.fn(),
  unpublish: jest.fn(),
  delete: jest.fn(),
  findItemIds: jest.fn(),
  findItemsWithProducts: jest.fn(),
  replaceItems: jest.fn(),
};

const productServiceMock = {
  findAll: jest.fn(),
  getCardsByIds: jest.fn(),
};

const categoryRepositoryMock = {
  findById: jest.fn(),
};

const revalidationMock = { revalidate: jest.fn() };

const carouselsTarget = { tags: ['carousels'], paths: ['/'] };

describe('CarouselService', () => {
  let service: CarouselService;

  beforeEach(async () => {
    jest.clearAllMocks();
    revalidationMock.revalidate.mockResolvedValue(undefined);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CarouselService,
        { provide: CarouselRepository, useValue: carouselRepositoryMock },
        { provide: ProductService, useValue: productServiceMock },
        { provide: CategoryRepository, useValue: categoryRepositoryMock },
        { provide: RevalidationNotifier, useValue: revalidationMock },
      ],
    }).compile();

    service = module.get<CarouselService>(CarouselService);
  });

  describe('resolveProducts via findAllPublished — rule sources', () => {
    it('BESTSELLING delegates to ProductService.findAll with the bestselling params', async () => {
      carouselRepositoryMock.findAllPublished.mockResolvedValue([baseCarousel]);
      productServiceMock.findAll.mockResolvedValue({ data: [productCard], meta: {} });

      const result = await service.findAllPublished();

      expect(productServiceMock.findAll).toHaveBeenCalledTimes(1);
      const query = productServiceMock.findAll.mock.calls[0][0] as ProductListQueryDto;
      expect(query).toBeInstanceOf(ProductListQueryDto);
      expect(query).toMatchObject({
        isActive: true,
        sortBy: 'bestselling',
        sortOrder: 'desc',
        page: 1,
        limit: 12,
      });
      expect(query.onSale).toBeUndefined();
      expect(query.categoryId).toBeUndefined();
      expect(result.data[0]).toBeInstanceOf(PublicCarouselEntity);
      expect(result.data[0].products).toEqual([productCard]);
    });

    it('NEWEST delegates with createdAt desc ordering', async () => {
      carouselRepositoryMock.findAllPublished.mockResolvedValue([
        { ...baseCarousel, source: CarouselSource.NEWEST, itemLimit: 8 },
      ]);
      productServiceMock.findAll.mockResolvedValue({ data: [], meta: {} });

      await service.findAllPublished();

      const query = productServiceMock.findAll.mock.calls[0][0] as ProductListQueryDto;
      expect(query).toMatchObject({
        isActive: true,
        sortBy: 'createdAt',
        sortOrder: 'desc',
        page: 1,
        limit: 8,
      });
      expect(query.onSale).toBeUndefined();
    });

    it('ON_SALE delegates with the server-side onSale filter', async () => {
      carouselRepositoryMock.findAllPublished.mockResolvedValue([
        { ...baseCarousel, source: CarouselSource.ON_SALE },
      ]);
      productServiceMock.findAll.mockResolvedValue({ data: [], meta: {} });

      await service.findAllPublished();

      const query = productServiceMock.findAll.mock.calls[0][0] as ProductListQueryDto;
      expect(query).toMatchObject({
        isActive: true,
        onSale: true,
        sortBy: 'createdAt',
        sortOrder: 'desc',
        page: 1,
        limit: 12,
      });
    });

    it('CATEGORY delegates with the stored categoryId (subtree rollup lives in findAll)', async () => {
      carouselRepositoryMock.findAllPublished.mockResolvedValue([
        { ...baseCarousel, source: CarouselSource.CATEGORY, categoryId: 'category-1' },
      ]);
      productServiceMock.findAll.mockResolvedValue({ data: [], meta: {} });

      await service.findAllPublished();

      const query = productServiceMock.findAll.mock.calls[0][0] as ProductListQueryDto;
      expect(query).toMatchObject({
        isActive: true,
        categoryId: 'category-1',
        sortBy: 'createdAt',
        sortOrder: 'desc',
        page: 1,
        limit: 12,
      });
    });

    it('CATEGORY with a null categoryId resolves to [] without calling findAll', async () => {
      carouselRepositoryMock.findAllPublished.mockResolvedValue([
        { ...baseCarousel, source: CarouselSource.CATEGORY, categoryId: null },
      ]);

      const result = await service.findAllPublished();

      expect(productServiceMock.findAll).not.toHaveBeenCalled();
      expect(result.data[0].products).toEqual([]);
    });
  });

  describe('resolveProducts via findAllPublished — MANUAL source', () => {
    it('orders item ids by sortOrder before calling getCardsByIds', async () => {
      carouselRepositoryMock.findAllPublished.mockResolvedValue([
        { ...baseCarousel, source: CarouselSource.MANUAL },
      ]);
      carouselRepositoryMock.findItemIds.mockResolvedValue([
        { productId: 'product-2', sortOrder: 0 },
        { productId: 'product-1', sortOrder: 1 },
      ]);
      productServiceMock.getCardsByIds.mockResolvedValue({ data: [productCard] });

      const result = await service.findAllPublished();

      expect(carouselRepositoryMock.findItemIds).toHaveBeenCalledWith('carousel-uuid-1');
      expect(productServiceMock.getCardsByIds).toHaveBeenCalledWith(['product-2', 'product-1']);
      expect(productServiceMock.findAll).not.toHaveBeenCalled();
      expect(result.data[0].products).toEqual([productCard]);
    });

    it('an empty item set resolves to [] without calling getCardsByIds', async () => {
      carouselRepositoryMock.findAllPublished.mockResolvedValue([
        { ...baseCarousel, source: CarouselSource.MANUAL },
      ]);
      carouselRepositoryMock.findItemIds.mockResolvedValue([]);

      const result = await service.findAllPublished();

      expect(productServiceMock.getCardsByIds).not.toHaveBeenCalled();
      expect(result.data[0].products).toEqual([]);
    });
  });

  describe('findAllPublished — empty-carousel behavior', () => {
    it('includes a carousel whose resolved product list is empty', async () => {
      carouselRepositoryMock.findAllPublished.mockResolvedValue([
        baseCarousel,
        { ...baseCarousel, id: 'carousel-uuid-3', source: CarouselSource.MANUAL },
      ]);
      productServiceMock.findAll.mockResolvedValue({ data: [productCard], meta: {} });
      carouselRepositoryMock.findItemIds.mockResolvedValue([]);

      const result = await service.findAllPublished();

      expect(result.data).toHaveLength(2);
      expect(result.data[1].id).toBe('carousel-uuid-3');
      expect(result.data[1].products).toEqual([]);
    });
  });

  describe('findAllPublished — placement filter (TASK-288)', () => {
    it('forwards the requested placement to the repository and echoes it on the entity', async () => {
      carouselRepositoryMock.findAllPublished.mockResolvedValue([
        { ...baseCarousel, placement: CarouselPlacement.HOME_TABS },
      ]);
      productServiceMock.findAll.mockResolvedValue({ data: [productCard], meta: {} });

      const result = await service.findAllPublished({ placement: CarouselPlacement.HOME_TABS });

      expect(carouselRepositoryMock.findAllPublished).toHaveBeenCalledWith({
        placement: CarouselPlacement.HOME_TABS,
      });
      expect(result.data[0]).toBeInstanceOf(PublicCarouselEntity);
      expect(result.data[0].placement).toBe(CarouselPlacement.HOME_TABS);
    });

    it('asks for every placement when the query omits it (pre-TASK-288 behaviour)', async () => {
      carouselRepositoryMock.findAllPublished.mockResolvedValue([]);

      await service.findAllPublished();

      expect(carouselRepositoryMock.findAllPublished).toHaveBeenCalledWith({
        placement: undefined,
      });
    });

    it('resolves products identically whatever the placement (placement is render-only)', async () => {
      carouselRepositoryMock.findAllPublished.mockResolvedValue([
        { ...baseCarousel, placement: CarouselPlacement.HOME_TABS },
      ]);
      productServiceMock.findAll.mockResolvedValue({ data: [productCard], meta: {} });

      await service.findAllPublished({ placement: CarouselPlacement.HOME_TABS });

      const query = productServiceMock.findAll.mock.calls[0][0] as ProductListQueryDto;
      expect(query).toMatchObject({
        isActive: true,
        sortBy: 'bestselling',
        sortOrder: 'desc',
        page: 1,
        limit: 12,
      });
    });
  });

  describe('findAllAdmin / findByIdAdmin', () => {
    it('forwards the status filter and maps to entities', async () => {
      carouselRepositoryMock.findAllAdmin.mockResolvedValue([baseCarousel, draftCarousel]);

      const result = await service.findAllAdmin({ status: undefined });

      expect(result.data).toHaveLength(2);
      expect(result.data[0]).toBeInstanceOf(CarouselEntity);
      expect(carouselRepositoryMock.findAllAdmin).toHaveBeenCalledWith({
        placement: undefined,
        status: undefined,
      });
    });

    it('forwards the placement filter and exposes placement on the admin row', async () => {
      carouselRepositoryMock.findAllAdmin.mockResolvedValue([
        { ...baseCarousel, placement: CarouselPlacement.HOME_TABS },
      ]);

      const result = await service.findAllAdmin({ placement: CarouselPlacement.HOME_TABS });

      expect(carouselRepositoryMock.findAllAdmin).toHaveBeenCalledWith({
        placement: CarouselPlacement.HOME_TABS,
        status: undefined,
      });
      expect(result.data[0].placement).toBe(CarouselPlacement.HOME_TABS);
    });

    it('findByIdAdmin throws NotFoundException when not found', async () => {
      carouselRepositoryMock.findById.mockResolvedValue(null);

      await expect(service.findByIdAdmin('missing')).rejects.toThrow(NotFoundException);
    });
  });

  describe('create', () => {
    it('defaults to DRAFT (no publish, no revalidation) when status omitted', async () => {
      carouselRepositoryMock.create.mockResolvedValue(draftCarousel);

      await service.create({ title: 'Чернетка', source: CarouselSource.BESTSELLING });

      const passed = carouselRepositoryMock.create.mock.calls[0][0] as {
        status: PublishStatus;
        publishedAt: Date | null;
        categoryId: string | null;
      };
      expect(passed.status).toBe(PublishStatus.DRAFT);
      expect(passed.publishedAt).toBeNull();
      expect(passed.categoryId).toBeNull();
      expect(revalidationMock.revalidate).not.toHaveBeenCalled();
    });

    it('stamps publishedAt and revalidates the homepage when created PUBLISHED', async () => {
      carouselRepositoryMock.create.mockResolvedValue(baseCarousel);

      await service.create({
        title: 'Хіти продажів',
        source: CarouselSource.BESTSELLING,
        status: PublishStatus.PUBLISHED,
      });

      const passed = carouselRepositoryMock.create.mock.calls[0][0] as {
        status: PublishStatus;
        publishedAt: Date | null;
      };
      expect(passed.status).toBe(PublishStatus.PUBLISHED);
      expect(passed.publishedAt).toBeInstanceOf(Date);
      expect(revalidationMock.revalidate).toHaveBeenCalledWith(carouselsTarget);
    });

    it('verifies the category exists when source = CATEGORY and stores its id', async () => {
      categoryRepositoryMock.findById.mockResolvedValue({ id: 'category-1' });
      carouselRepositoryMock.create.mockResolvedValue({
        ...draftCarousel,
        source: CarouselSource.CATEGORY,
        categoryId: 'category-1',
      });

      await service.create({
        title: 'Аксесуари',
        source: CarouselSource.CATEGORY,
        categoryId: 'category-1',
      });

      expect(categoryRepositoryMock.findById).toHaveBeenCalledWith('category-1');
      const passed = carouselRepositoryMock.create.mock.calls[0][0] as {
        categoryId: string | null;
      };
      expect(passed.categoryId).toBe('category-1');
    });

    it('rejects an unresolvable categoryId when source = CATEGORY before writing', async () => {
      categoryRepositoryMock.findById.mockResolvedValue(null);

      await expect(
        service.create({
          title: 'Аксесуари',
          source: CarouselSource.CATEGORY,
          categoryId: 'missing-category',
        }),
      ).rejects.toThrow(NotFoundException);
      expect(carouselRepositoryMock.create).not.toHaveBeenCalled();
    });

    it('passes the requested placement to the repository (TASK-288)', async () => {
      carouselRepositoryMock.create.mockResolvedValue({
        ...draftCarousel,
        placement: CarouselPlacement.HOME_TABS,
      });

      const entity = await service.create({
        title: 'Хіти',
        source: CarouselSource.BESTSELLING,
        placement: CarouselPlacement.HOME_TABS,
      });

      const passed = carouselRepositoryMock.create.mock.calls[0][0] as {
        placement?: CarouselPlacement;
      };
      expect(passed.placement).toBe(CarouselPlacement.HOME_TABS);
      expect(entity.placement).toBe(CarouselPlacement.HOME_TABS);
    });

    it('leaves placement undefined when omitted (repository applies the HOME_RAILS default)', async () => {
      carouselRepositoryMock.create.mockResolvedValue(draftCarousel);

      await service.create({ title: 'Хіти', source: CarouselSource.BESTSELLING });

      const passed = carouselRepositoryMock.create.mock.calls[0][0] as {
        placement?: CarouselPlacement;
      };
      expect(passed.placement).toBeUndefined();
    });

    it('ignores a supplied categoryId for a non-CATEGORY source (stores null)', async () => {
      carouselRepositoryMock.create.mockResolvedValue(draftCarousel);

      await service.create({
        title: 'Хіти',
        source: CarouselSource.BESTSELLING,
        categoryId: 'category-1',
      });

      expect(categoryRepositoryMock.findById).not.toHaveBeenCalled();
      const passed = carouselRepositoryMock.create.mock.calls[0][0] as {
        categoryId: string | null;
      };
      expect(passed.categoryId).toBeNull();
    });
  });

  describe('update', () => {
    it('throws NotFoundException when the carousel is missing', async () => {
      carouselRepositoryMock.findById.mockResolvedValue(null);

      await expect(service.update('missing', { title: 'x' })).rejects.toThrow(NotFoundException);
    });

    it('does not touch publish fields when status is omitted', async () => {
      carouselRepositoryMock.findById.mockResolvedValue(baseCarousel);
      carouselRepositoryMock.update.mockResolvedValue(baseCarousel);

      await service.update('carousel-uuid-1', { title: 'Renamed' });

      const passed = carouselRepositoryMock.update.mock.calls[0][1] as {
        status?: PublishStatus;
        publishedAt?: Date | null;
      };
      expect(passed.status).toBeUndefined();
      expect(passed.publishedAt).toBeUndefined();
    });

    it('revalidates when editing an already-PUBLISHED carousel in place', async () => {
      carouselRepositoryMock.findById.mockResolvedValue(baseCarousel);
      carouselRepositoryMock.update.mockResolvedValue(baseCarousel);

      await service.update('carousel-uuid-1', { title: 'Renamed' });

      expect(revalidationMock.revalidate).toHaveBeenCalledWith(carouselsTarget);
    });

    it('does not revalidate when editing a DRAFT that stays draft', async () => {
      carouselRepositoryMock.findById.mockResolvedValue(draftCarousel);
      carouselRepositoryMock.update.mockResolvedValue(draftCarousel);

      await service.update('carousel-uuid-2', { title: 'Renamed' });

      expect(revalidationMock.revalidate).not.toHaveBeenCalled();
    });

    it('writes a new placement and revalidates the homepage for a live carousel (TASK-288)', async () => {
      carouselRepositoryMock.findById.mockResolvedValue(baseCarousel);
      carouselRepositoryMock.update.mockResolvedValue({
        ...baseCarousel,
        placement: CarouselPlacement.HOME_TABS,
      });

      const entity = await service.update('carousel-uuid-1', {
        placement: CarouselPlacement.HOME_TABS,
      });

      const passed = carouselRepositoryMock.update.mock.calls[0][1] as {
        placement?: CarouselPlacement;
      };
      expect(passed.placement).toBe(CarouselPlacement.HOME_TABS);
      expect(entity.placement).toBe(CarouselPlacement.HOME_TABS);
      expect(revalidationMock.revalidate).toHaveBeenCalledWith(carouselsTarget);
    });

    it('leaves placement untouched when the update omits it', async () => {
      carouselRepositoryMock.findById.mockResolvedValue(baseCarousel);
      carouselRepositoryMock.update.mockResolvedValue(baseCarousel);

      await service.update('carousel-uuid-1', { title: 'Renamed' });

      const passed = carouselRepositoryMock.update.mock.calls[0][1] as {
        placement?: CarouselPlacement;
      };
      expect(passed.placement).toBeUndefined();
    });

    it('preserves the original publishedAt when re-saving an already-PUBLISHED carousel', async () => {
      carouselRepositoryMock.findById.mockResolvedValue(baseCarousel);
      carouselRepositoryMock.update.mockResolvedValue(baseCarousel);

      await service.update('carousel-uuid-1', { status: PublishStatus.PUBLISHED });

      const passed = carouselRepositoryMock.update.mock.calls[0][1] as {
        status?: PublishStatus;
        publishedAt?: Date | null;
      };
      expect(passed.status).toBe(PublishStatus.PUBLISHED);
      expect(passed.publishedAt).toEqual(baseCarousel.publishedAt);
    });

    it('requires a resolvable category when switching source to CATEGORY', async () => {
      carouselRepositoryMock.findById.mockResolvedValue(draftCarousel);
      categoryRepositoryMock.findById.mockResolvedValue(null);

      await expect(
        service.update('carousel-uuid-2', {
          source: CarouselSource.CATEGORY,
          categoryId: 'missing-category',
        }),
      ).rejects.toThrow(NotFoundException);
      expect(carouselRepositoryMock.update).not.toHaveBeenCalled();
    });

    it('throws when switching to CATEGORY with no categoryId anywhere', async () => {
      carouselRepositoryMock.findById.mockResolvedValue(draftCarousel);

      await expect(
        service.update('carousel-uuid-2', { source: CarouselSource.CATEGORY }),
      ).rejects.toThrow(NotFoundException);
    });

    it('falls back to the existing categoryId when switching to CATEGORY without one', async () => {
      carouselRepositoryMock.findById.mockResolvedValue({
        ...draftCarousel,
        categoryId: 'category-1',
      });
      categoryRepositoryMock.findById.mockResolvedValue({ id: 'category-1' });
      carouselRepositoryMock.update.mockResolvedValue(draftCarousel);

      await service.update('carousel-uuid-2', { source: CarouselSource.CATEGORY });

      expect(categoryRepositoryMock.findById).toHaveBeenCalledWith('category-1');
      const passed = carouselRepositoryMock.update.mock.calls[0][1] as {
        categoryId?: string | null;
      };
      expect(passed.categoryId).toBe('category-1');
    });

    it('clears the stored categoryId when switching away from CATEGORY', async () => {
      carouselRepositoryMock.findById.mockResolvedValue({
        ...draftCarousel,
        source: CarouselSource.CATEGORY,
        categoryId: 'category-1',
      });
      carouselRepositoryMock.update.mockResolvedValue(draftCarousel);

      await service.update('carousel-uuid-2', { source: CarouselSource.MANUAL });

      const passed = carouselRepositoryMock.update.mock.calls[0][1] as {
        categoryId?: string | null;
      };
      expect(passed.categoryId).toBeNull();
    });
  });

  describe('publish / unpublish', () => {
    it('publish throws NotFoundException when missing', async () => {
      carouselRepositoryMock.findById.mockResolvedValue(null);
      await expect(service.publish('missing')).rejects.toThrow(NotFoundException);
    });

    it('publish sets the carousel PUBLISHED and revalidates the homepage', async () => {
      carouselRepositoryMock.findById.mockResolvedValue(draftCarousel);
      carouselRepositoryMock.publish.mockResolvedValue({
        ...draftCarousel,
        status: PublishStatus.PUBLISHED,
      });

      const result = await service.publish('carousel-uuid-2');

      expect(result.status).toBe(PublishStatus.PUBLISHED);
      expect(revalidationMock.revalidate).toHaveBeenCalledWith(carouselsTarget);
    });

    it('unpublish sets the carousel DRAFT and revalidates the homepage', async () => {
      carouselRepositoryMock.findById.mockResolvedValue(baseCarousel);
      carouselRepositoryMock.unpublish.mockResolvedValue({
        ...baseCarousel,
        status: PublishStatus.DRAFT,
      });

      const result = await service.unpublish('carousel-uuid-1');

      expect(result.status).toBe(PublishStatus.DRAFT);
      expect(revalidationMock.revalidate).toHaveBeenCalledWith(carouselsTarget);
    });
  });

  describe('delete', () => {
    it('throws NotFoundException when missing', async () => {
      carouselRepositoryMock.findById.mockResolvedValue(null);
      await expect(service.delete('missing')).rejects.toThrow(NotFoundException);
    });

    it('hard-deletes and revalidates when the carousel was PUBLISHED', async () => {
      carouselRepositoryMock.findById.mockResolvedValue(baseCarousel);
      carouselRepositoryMock.delete.mockResolvedValue(baseCarousel);

      await service.delete('carousel-uuid-1');

      expect(carouselRepositoryMock.delete).toHaveBeenCalledWith('carousel-uuid-1');
      expect(revalidationMock.revalidate).toHaveBeenCalledWith(carouselsTarget);
    });

    it('hard-deletes without revalidating when the carousel was a DRAFT', async () => {
      carouselRepositoryMock.findById.mockResolvedValue(draftCarousel);
      carouselRepositoryMock.delete.mockResolvedValue(draftCarousel);

      await service.delete('carousel-uuid-2');

      expect(revalidationMock.revalidate).not.toHaveBeenCalled();
    });
  });

  describe('getItems', () => {
    const itemRow = {
      id: 'item-1',
      productId: 'product-1',
      sortOrder: 0,
      product: {
        id: 'product-1',
        name: 'Case',
        price: { toString: () => '29.99' },
        isActive: false,
        images: [{ url: '/images/case.jpg' }],
      },
    };

    it('throws NotFoundException when the carousel is missing', async () => {
      carouselRepositoryMock.findById.mockResolvedValue(null);
      await expect(service.getItems('missing')).rejects.toThrow(NotFoundException);
    });

    it('maps repository rows to entities, keeping inactive products (admin fidelity)', async () => {
      carouselRepositoryMock.findById.mockResolvedValue(baseCarousel);
      carouselRepositoryMock.findItemsWithProducts.mockResolvedValue([itemRow]);

      const result = await service.getItems('carousel-uuid-1');

      expect(result).toHaveLength(1);
      expect(result[0]).toBeInstanceOf(CarouselItemEntity);
      expect(result[0].product).toMatchObject({
        id: 'product-1',
        name: 'Case',
        imageUrl: '/images/case.jpg',
        price: '29.99',
        isActive: false,
      });
    });
  });

  describe('setItems', () => {
    beforeEach(() => {
      carouselRepositoryMock.findItemsWithProducts.mockResolvedValue([]);
      carouselRepositoryMock.replaceItems.mockResolvedValue(undefined);
    });

    it('throws NotFoundException when the carousel is missing', async () => {
      carouselRepositoryMock.findById.mockResolvedValue(null);

      await expect(service.setItems('missing', { items: [] })).rejects.toThrow(NotFoundException);
      expect(carouselRepositoryMock.replaceItems).not.toHaveBeenCalled();
    });

    it('full-replaces the item set (add / remove / reorder in one write)', async () => {
      carouselRepositoryMock.findById.mockResolvedValue({
        ...baseCarousel,
        source: CarouselSource.MANUAL,
      });

      await service.setItems('carousel-uuid-1', {
        items: [
          { productId: 'product-2', sortOrder: 0 },
          { productId: 'product-1', sortOrder: 1 },
        ],
      });

      expect(carouselRepositoryMock.replaceItems).toHaveBeenCalledWith('carousel-uuid-1', [
        { productId: 'product-2', sortOrder: 0 },
        { productId: 'product-1', sortOrder: 1 },
      ]);
    });

    it('clears to empty via an empty items array', async () => {
      carouselRepositoryMock.findById.mockResolvedValue({
        ...baseCarousel,
        source: CarouselSource.MANUAL,
      });

      await service.setItems('carousel-uuid-1', { items: [] });

      expect(carouselRepositoryMock.replaceItems).toHaveBeenCalledWith('carousel-uuid-1', []);
    });

    it('accepts a write on a non-MANUAL carousel (inert until switched)', async () => {
      carouselRepositoryMock.findById.mockResolvedValue(draftCarousel);

      await service.setItems('carousel-uuid-2', {
        items: [{ productId: 'product-1', sortOrder: 0 }],
      });

      expect(carouselRepositoryMock.replaceItems).toHaveBeenCalledWith('carousel-uuid-2', [
        { productId: 'product-1', sortOrder: 0 },
      ]);
    });

    it('revalidates only when the target carousel is currently PUBLISHED', async () => {
      carouselRepositoryMock.findById.mockResolvedValue({
        ...baseCarousel,
        source: CarouselSource.MANUAL,
      });

      await service.setItems('carousel-uuid-1', { items: [] });

      expect(revalidationMock.revalidate).toHaveBeenCalledWith(carouselsTarget);
    });

    it('does not revalidate when the target carousel is a DRAFT', async () => {
      carouselRepositoryMock.findById.mockResolvedValue(draftCarousel);

      await service.setItems('carousel-uuid-2', { items: [] });

      expect(revalidationMock.revalidate).not.toHaveBeenCalled();
    });
  });
});
