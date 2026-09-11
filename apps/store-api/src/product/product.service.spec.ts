import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, ConflictException, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  ProductRepository,
  ProductsNotFoundError,
  CreateProductInput,
  UpdateProductInput,
} from './product.repository';
import { ProductDeviceCompatRepository } from './product-device-compat.repository';
import { ProductSpecRepository } from './product-spec.repository';
import { CategoryRepository } from '../category';
import { BrandRepository } from '../brand';
import { DeviceRepository } from '../device';
import { AttributeDefinitionRepository } from '../attribute-definition';
import { ProductService } from './product.service';
import { ProductEntity, PublicProductEntity } from './entities';
import { ProductListQueryDto } from './dto';
import {
  CacheService,
  buildProductListKey,
  productDetailIdKey,
  productDetailSlugKey,
  PRODUCT_LIST_PREFIX,
} from '../cache';
import { ProductIndexer } from '../search/product-indexer';
import { CATALOGUE_REVALIDATE_TARGET, RevalidationNotifier } from '../publishing';

// ─── Mock data ────────────────────────────────────────────────────────────────

const mockProduct = {
  id: 'product-uuid-1',
  name: 'iPhone 15 Pro Case — Clear MagSafe',
  slug: 'iphone-15-pro-case-clear-magsafe',
  description: 'Premium clear case with MagSafe compatibility',
  price: { toString: () => '29.99' },
  compareAtPrice: { toString: () => '39.99' },
  sku: 'IP15-PRO-CASE-CLR',
  stock: 150,
  categoryId: 'category-uuid-1',
  groupId: null,
  attributes: {},
  positionOrder: 0,
  isActive: true,
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
  updatedAt: new Date('2026-01-01T00:00:00.000Z'),
};

const mockInactiveProduct = {
  ...mockProduct,
  id: 'product-uuid-2',
  name: 'Discontinued Case',
  slug: 'discontinued-case',
  isActive: false,
};

// ─── ProductRepository mock ───────────────────────────────────────────────────

const productRepositoryMock = {
  findById: jest.fn(),
  findBySlug: jest.fn(),
  findBySku: jest.fn(),
  findBySlugWithRelations: jest.fn(),
  findAll: jest.fn(),
  findByIdsForCards: jest.fn(),
  create: jest.fn(),
  update: jest.fn(),
  deactivate: jest.fn(),
  activate: jest.fn(),
  setActiveMany: jest.fn(),
  softDelete: jest.fn(),
  // TASK-254: derived reserved-qty aggregate. Defaults to an empty map (no
  // reservations); individual tests override to assert the enrichment.
  getReservedQtyByProductId: jest.fn().mockResolvedValue(new Map<string, number>()),
};

// ─── CategoryRepository mock (TASK-236 subtree rollup) ────────────────────────
// `findSubtreeIds` echoes back a single-element subtree by default; individual
// tests override it to simulate a real parent → subcategory expansion.
const categoryRepositoryMock = {
  findSubtreeIds: jest.fn((id: string) => Promise.resolve([id])),
};

// ─── BrandRepository mock (TASK-189 brand validation on create/update) ────────
// `findById` resolves to a stub brand by default so create/update pass the
// existence check; tests override it to null to simulate an unknown brand.
const brandRepositoryMock = {
  findById: jest.fn().mockResolvedValue({ id: 'brand-uuid-1', name: 'Spigen', slug: 'spigen' }),
};

// ─── Device compat mocks (TASK-190) ───────────────────────────────────────────
// Compat enrichment defaults to empty; the compat-assignment tests override.
const deviceCompatRepositoryMock = {
  getDeviceCompat: jest.fn().mockResolvedValue([]),
  getDeviceCompatByProductIds: jest.fn().mockResolvedValue(new Map()),
  getDeviceModelIds: jest.fn().mockResolvedValue([]),
  setDeviceCompat: jest.fn().mockResolvedValue(undefined),
  setDeviceCompatForGroup: jest.fn().mockResolvedValue({ updatedCount: 0, productIds: [] }),
  countGroupPositions: jest.fn().mockResolvedValue(0),
};

const deviceRepositoryMock = {
  findModelsByIds: jest.fn().mockResolvedValue([]),
};

// ─── ProductSpecRepository / AttributeDefinitionRepository mocks (TASK-191) ────
const specRepositoryMock = {
  getSpecs: jest.fn().mockResolvedValue([]),
  setSpecs: jest.fn().mockResolvedValue(undefined),
};

const attributeDefinitionRepositoryMock = {
  findEffectiveForCategory: jest.fn().mockResolvedValue([]),
};

// ─── CacheService mock ────────────────────────────────────────────────────────
// Defaults: get → null (cache miss), all writes resolve. Individual tests
// override `get` to simulate a HIT or a backend error.

const cacheServiceMock = {
  get: jest.fn().mockResolvedValue(null),
  set: jest.fn().mockResolvedValue(undefined),
  del: jest.fn().mockResolvedValue(undefined),
  delByPrefix: jest.fn().mockResolvedValue(undefined),
};

const configServiceMock = {
  get: jest.fn().mockReturnValue(300),
};

// ─── ProductIndexer mock (TASK-075 search-index seam) ─────────────────────────
// Both methods resolve by default; individual tests override to simulate a
// failing indexer and assert it never breaks the product write.

const productIndexerMock = {
  index: jest.fn().mockResolvedValue(undefined),
  remove: jest.fn().mockResolvedValue(undefined),
};

// ─── RevalidationNotifier mock (TASK-384 storefront purge) ───────────────────
// Product writes must purge the storefront's prerendered homepage, not just the
// Redis list cache: the homepage bakes carousel product lists (name, price,
// image) into static HTML, so before this it kept serving the old numbers while
// /products — rendered per request — was already correct.

const revalidationMock = {
  revalidate: jest.fn().mockResolvedValue(undefined),
};

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('ProductService', () => {
  let service: ProductService;

  beforeEach(async () => {
    jest.clearAllMocks();
    // Restore default mock implementations cleared by clearAllMocks.
    cacheServiceMock.get.mockResolvedValue(null);
    cacheServiceMock.set.mockResolvedValue(undefined);
    cacheServiceMock.del.mockResolvedValue(undefined);
    cacheServiceMock.delByPrefix.mockResolvedValue(undefined);
    configServiceMock.get.mockReturnValue(300);
    productIndexerMock.index.mockResolvedValue(undefined);
    productIndexerMock.remove.mockResolvedValue(undefined);
    revalidationMock.revalidate.mockResolvedValue(undefined);
    categoryRepositoryMock.findSubtreeIds.mockImplementation((id: string) => Promise.resolve([id]));
    brandRepositoryMock.findById.mockResolvedValue({
      id: 'brand-uuid-1',
      name: 'Spigen',
      slug: 'spigen',
    });
    deviceCompatRepositoryMock.getDeviceCompat.mockResolvedValue([]);
    deviceCompatRepositoryMock.getDeviceCompatByProductIds.mockResolvedValue(new Map());
    deviceCompatRepositoryMock.getDeviceModelIds.mockResolvedValue([]);
    deviceCompatRepositoryMock.setDeviceCompat.mockResolvedValue(undefined);
    deviceCompatRepositoryMock.setDeviceCompatForGroup.mockResolvedValue({
      updatedCount: 0,
      productIds: [],
    });
    deviceCompatRepositoryMock.countGroupPositions.mockResolvedValue(0);
    deviceRepositoryMock.findModelsByIds.mockResolvedValue([]);
    specRepositoryMock.getSpecs.mockResolvedValue([]);
    specRepositoryMock.setSpecs.mockResolvedValue(undefined);
    attributeDefinitionRepositoryMock.findEffectiveForCategory.mockResolvedValue([]);
    productRepositoryMock.getReservedQtyByProductId.mockResolvedValue(new Map<string, number>());

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ProductService,
        { provide: ProductRepository, useValue: productRepositoryMock },
        { provide: CacheService, useValue: cacheServiceMock },
        { provide: ConfigService, useValue: configServiceMock },
        { provide: ProductIndexer, useValue: productIndexerMock },
        { provide: CategoryRepository, useValue: categoryRepositoryMock },
        { provide: BrandRepository, useValue: brandRepositoryMock },
        { provide: ProductDeviceCompatRepository, useValue: deviceCompatRepositoryMock },
        { provide: DeviceRepository, useValue: deviceRepositoryMock },
        { provide: ProductSpecRepository, useValue: specRepositoryMock },
        {
          provide: AttributeDefinitionRepository,
          useValue: attributeDefinitionRepositoryMock,
        },
        { provide: RevalidationNotifier, useValue: revalidationMock },
      ],
    }).compile();

    service = module.get<ProductService>(ProductService);
  });

  // ─── findAll (public) ────────────────────────────────────────────────────────

  describe('findAll', () => {
    const query: ProductListQueryDto = {
      page: 1,
      limit: 20,
    };

    const paginatedResult = {
      products: [mockProduct],
      total: 1,
    };

    it('should return paginated results with meta', async () => {
      productRepositoryMock.findAll.mockResolvedValue(paginatedResult);

      const result = await service.findAll(query);

      expect(result.data).toHaveLength(1);
      expect(result.data[0]).toBeInstanceOf(PublicProductEntity);
      expect(result.meta.total).toBe(1);
      expect(result.meta.page).toBe(1);
      expect(result.meta.limit).toBe(20);
      expect(result.meta.totalPages).toBe(1);
      expect(productRepositoryMock.findAll).toHaveBeenCalledWith({
        page: 1,
        limit: 20,
        // No category filter requested → no subtree expansion (TASK-236).
        categoryIds: undefined,
        // TASK-230: the public listing always forces the active-only filter.
        isActive: true,
        // TASK-297: …and always drops the products of withdrawn categories.
        categoryActiveOnly: true,
        // TASK-362: sold-out products sort to the back of every public page.
        inStockFirst: true,
        minPrice: undefined,
        maxPrice: undefined,
        search: undefined,
        sortBy: 'createdAt',
        sortOrder: 'desc',
      });
      expect(categoryRepositoryMock.findSubtreeIds).not.toHaveBeenCalled();
    });

    it('should calculate totalPages correctly for multiple pages', async () => {
      productRepositoryMock.findAll.mockResolvedValue({
        products: [mockProduct],
        total: 42,
      });

      const result = await service.findAll({ ...query, limit: 20 });

      expect(result.meta.totalPages).toBe(3); // ceil(42/20) = 3
    });

    it('should pass filter parameters to repository', async () => {
      productRepositoryMock.findAll.mockResolvedValue({ products: [], total: 0 });

      const filterQuery: ProductListQueryDto = {
        page: 2,
        limit: 10,
        categoryId: 'cat-uuid-1',
        isActive: true,
        minPrice: 10,
        maxPrice: 50,
        search: 'iphone',
        sortBy: 'price',
        sortOrder: 'asc',
      };

      await service.findAll(filterQuery);

      expect(productRepositoryMock.findAll).toHaveBeenCalledWith({
        page: 2,
        limit: 10,
        // Single categoryId resolved to its subtree before hitting the repo.
        categoryIds: ['cat-uuid-1'],
        isActive: true,
        categoryActiveOnly: true,
        // TASK-362: sold-out products sort to the back of every public page.
        inStockFirst: true,
        minPrice: 10,
        maxPrice: 50,
        search: 'iphone',
        sortBy: 'price',
        sortOrder: 'asc',
      });
      expect(categoryRepositoryMock.findSubtreeIds).toHaveBeenCalledWith('cat-uuid-1');
    });

    // TASK-236: filtering by a ROOT category must roll up its subcategories'
    // products — the service expands the id set before delegating to the repo.
    it('expands a requested categoryId into its full subtree before querying', async () => {
      productRepositoryMock.findAll.mockResolvedValue({ products: [], total: 0 });
      categoryRepositoryMock.findSubtreeIds.mockResolvedValue([
        'root-cat',
        'child-cat',
        'grandchild-cat',
      ]);

      await service.findAll({ page: 1, limit: 20, categoryId: 'root-cat' });

      expect(categoryRepositoryMock.findSubtreeIds).toHaveBeenCalledWith('root-cat');
      expect(productRepositoryMock.findAll).toHaveBeenCalledWith(
        expect.objectContaining({
          categoryIds: ['root-cat', 'child-cat', 'grandchild-cat'],
        }),
      );
    });

    // TASK-230: the leak — a public caller asking for inactive products (or
    // sending no filter) must still get only active ones.
    // TASK-362: sold-out products sort behind everything in stock, so page 1 is
    // not led by things nobody can buy.
    it('pushes out-of-stock products to the back of the public listing', async () => {
      productRepositoryMock.findAll.mockResolvedValue({ products: [], total: 0 });

      await service.findAll(query);

      expect(productRepositoryMock.findAll).toHaveBeenCalledWith(
        expect.objectContaining({ inStockFirst: true }),
      );
    });

    it('overrides an explicit isActive=false from a public caller with true', async () => {
      productRepositoryMock.findAll.mockResolvedValue({ products: [], total: 0 });

      await service.findAll({ ...query, isActive: false });

      expect(productRepositoryMock.findAll).toHaveBeenCalledWith(
        expect.objectContaining({ isActive: true }),
      );
    });

    // TASK-297: the public list must also hide the products of a WITHDRAWN
    // category — a filter no query param can switch off.
    it('always asks the repository for on-sale categories only', async () => {
      productRepositoryMock.findAll.mockResolvedValue({ products: [], total: 0 });

      await service.findAll({ ...query, isActive: false });

      expect(productRepositoryMock.findAll).toHaveBeenCalledWith(
        expect.objectContaining({ categoryActiveOnly: true }),
      );
    });
  });

  // ─── adminFindAll (admin, TASK-230) ─────────────────────────────────────────

  describe('adminFindAll', () => {
    // TASK-362: the admin listing must NOT reorder by availability — restocking
    // means going looking for exactly the zero-stock rows.
    it('leaves the ordering alone rather than pushing out-of-stock rows back', async () => {
      productRepositoryMock.findAll.mockResolvedValue({ products: [], total: 0 });

      await service.adminFindAll({ page: 1, limit: 20 });

      const params = productRepositoryMock.findAll.mock.calls[0][0] as {
        inStockFirst?: boolean;
      };
      expect(params.inStockFirst).toBeFalsy();
    });

    it('respects the isActive filter as sent (undefined = all products) and skips the cache', async () => {
      productRepositoryMock.findAll.mockResolvedValue({ products: [mockProduct], total: 1 });

      const result = await service.adminFindAll({ page: 1, limit: 20 });

      expect(productRepositoryMock.findAll).toHaveBeenCalledWith(
        expect.objectContaining({ isActive: undefined }),
      );
      expect(result.data).toHaveLength(1);
      expect(result.meta.total).toBe(1);
      // No cache interaction: the admin table must always be fresh.
      expect(cacheServiceMock.get).not.toHaveBeenCalled();
      expect(cacheServiceMock.set).not.toHaveBeenCalled();
    });

    // TASK-297: the operator must still SEE the products a category deactivation
    // stranded — they are the ones they have to re-file.
    it('never applies the on-sale-category filter to the admin listing', async () => {
      productRepositoryMock.findAll.mockResolvedValue({ products: [], total: 0 });

      await service.adminFindAll({ page: 1, limit: 20 });

      const params = productRepositoryMock.findAll.mock.calls[0][0];
      expect(params.categoryActiveOnly).toBeUndefined();
    });

    it('rolls up the category subtree on the admin path too (TASK-236)', async () => {
      productRepositoryMock.findAll.mockResolvedValue({ products: [], total: 0 });
      categoryRepositoryMock.findSubtreeIds.mockResolvedValue(['root-cat', 'child-cat']);

      await service.adminFindAll({ page: 1, limit: 20, categoryId: 'root-cat' });

      expect(categoryRepositoryMock.findSubtreeIds).toHaveBeenCalledWith('root-cat');
      expect(productRepositoryMock.findAll).toHaveBeenCalledWith(
        expect.objectContaining({ categoryIds: ['root-cat', 'child-cat'] }),
      );
    });

    it('passes isActive=false through so the admin can list only deactivated products', async () => {
      productRepositoryMock.findAll.mockResolvedValue({ products: [], total: 0 });

      await service.adminFindAll({ page: 1, limit: 20, isActive: false });

      expect(productRepositoryMock.findAll).toHaveBeenCalledWith(
        expect.objectContaining({ isActive: false }),
      );
    });

    // AD-PROD-08 (TASK-406): the operator looks a position up by its article
    // number. The flag is the whole reason the public search cannot — both
    // listings go through the same repository method.
    it('lets the admin search reach the article number (searchIncludesSku)', async () => {
      productRepositoryMock.findAll.mockResolvedValue({ products: [], total: 0 });

      await service.adminFindAll({ page: 1, limit: 20, search: 'AB-1234' });

      expect(productRepositoryMock.findAll).toHaveBeenCalledWith(
        expect.objectContaining({ search: 'AB-1234', searchIncludesSku: true }),
      );
    });

    it('leaves the public listing without the sku flag (the leak guard)', async () => {
      productRepositoryMock.findAll.mockResolvedValue({ products: [], total: 0 });
      cacheServiceMock.get.mockResolvedValue(null);

      await service.findAll({ page: 1, limit: 20, search: 'AB-1234' });

      expect(productRepositoryMock.findAll).toHaveBeenCalledWith(
        expect.not.objectContaining({ searchIncludesSku: true }),
      );
    });

    // TASK-254: the admin list now returns full ProductEntity items (raw stock,
    // reservedQty/physicalQty) — not the PublicProductEntity the public list uses.
    it('returns ProductEntity items enriched with derived reserved/physical stock', async () => {
      productRepositoryMock.findAll.mockResolvedValue({ products: [mockProduct], total: 1 });
      productRepositoryMock.getReservedQtyByProductId.mockResolvedValue(
        new Map([['product-uuid-1', 4]]),
      );

      const result = await service.adminFindAll({ page: 1, limit: 20 });

      expect(result.data[0]).toBeInstanceOf(ProductEntity);
      expect(result.data[0]).not.toBeInstanceOf(PublicProductEntity);
      expect(result.data[0].stock).toBe(150);
      expect(result.data[0].reservedQty).toBe(4);
      expect(result.data[0].physicalQty).toBe(154); // stock + reserved
      // The aggregate is fetched once for the whole page of ids.
      expect(productRepositoryMock.getReservedQtyByProductId).toHaveBeenCalledWith([
        'product-uuid-1',
      ]);
    });

    it('defaults reservedQty to 0 (physicalQty = stock) for a product with no reservations', async () => {
      productRepositoryMock.findAll.mockResolvedValue({ products: [mockProduct], total: 1 });
      // Default mock returns an empty map → no reservation for this product.

      const result = await service.adminFindAll({ page: 1, limit: 20 });

      expect(result.data[0].reservedQty).toBe(0);
      expect(result.data[0].physicalQty).toBe(150);
    });
  });

  // ─── getCardsByIds (public, TASK-211) ────────────────────────────────────────

  describe('getCardsByIds', () => {
    const productA = { ...mockProduct, id: 'card-uuid-a', slug: 'card-a' };
    const productB = { ...mockProduct, id: 'card-uuid-b', slug: 'card-b' };

    it('returns PublicProductEntity cards in the requested id order', async () => {
      // Repository returns them in DB order (not request order).
      productRepositoryMock.findByIdsForCards.mockResolvedValue([productA, productB]);

      const result = await service.getCardsByIds(['card-uuid-b', 'card-uuid-a']);

      expect(result.data).toHaveLength(2);
      expect(result.data[0]).toBeInstanceOf(PublicProductEntity);
      expect(result.data.map((p) => p.id)).toEqual(['card-uuid-b', 'card-uuid-a']);
    });

    it('silently drops unknown / inactive ids so a stale client history self-heals', async () => {
      productRepositoryMock.findByIdsForCards.mockResolvedValue([productA]);

      const result = await service.getCardsByIds(['missing-uuid', 'card-uuid-a']);

      expect(result.data.map((p) => p.id)).toEqual(['card-uuid-a']);
    });

    it('collapses duplicate ids to the first occurrence before hitting the repository', async () => {
      productRepositoryMock.findByIdsForCards.mockResolvedValue([productA]);

      const result = await service.getCardsByIds(['card-uuid-a', 'card-uuid-a']);

      expect(productRepositoryMock.findByIdsForCards).toHaveBeenCalledWith(['card-uuid-a']);
      expect(result.data).toHaveLength(1);
    });

    it('returns an empty list when nothing matches, without touching the cache', async () => {
      productRepositoryMock.findByIdsForCards.mockResolvedValue([]);

      const result = await service.getCardsByIds(['card-uuid-a']);

      expect(result.data).toEqual([]);
      expect(cacheServiceMock.get).not.toHaveBeenCalled();
      expect(cacheServiceMock.set).not.toHaveBeenCalled();
    });
  });

  // ─── findBySlug (public) ─────────────────────────────────────────────────────

  describe('findBySlug', () => {
    it('should return product with relations when found', async () => {
      const productWithRelations = {
        ...mockProduct,
        category: { id: 'cat-1', name: 'Phone Cases', slug: 'phone-cases' },
        group: null,
        images: [],
      };
      productRepositoryMock.findBySlugWithRelations.mockResolvedValue(productWithRelations);

      const result = await service.findBySlug('iphone-15-pro-case-clear-magsafe');

      expect(result).toHaveProperty('data');
      expect(result.data).toBeInstanceOf(PublicProductEntity);
      expect(result.data.slug).toBe('iphone-15-pro-case-clear-magsafe');
      expect(result).toHaveProperty('category');
      expect(result).toHaveProperty('group');
      expect(result).toHaveProperty('images');
      expect(productRepositoryMock.findBySlugWithRelations).toHaveBeenCalledWith(
        'iphone-15-pro-case-clear-magsafe',
      );
    });

    it('should throw NotFoundException when product slug is not found', async () => {
      productRepositoryMock.findBySlugWithRelations.mockResolvedValue(null);

      await expect(service.findBySlug('nonexistent-slug')).rejects.toThrow(NotFoundException);
      expect(productRepositoryMock.findBySlugWithRelations).toHaveBeenCalledWith(
        'nonexistent-slug',
      );
    });

    it('should throw NotFoundException when the product exists but is inactive (TASK-145)', async () => {
      // The repository applies the default `activeOnly: true` filter, so a
      // deactivated product resolves to null — indistinguishable from a missing
      // slug. The service surfaces this as a 404, hiding it from the storefront.
      productRepositoryMock.findBySlugWithRelations.mockResolvedValue(null);

      await expect(service.findBySlug('discontinued-case')).rejects.toThrow(NotFoundException);
      expect(productRepositoryMock.findBySlugWithRelations).toHaveBeenCalledWith(
        'discontinued-case',
      );
    });
  });

  // ─── findById (admin) ────────────────────────────────────────────────────────

  describe('findById', () => {
    it('should return ProductEntity when product is found', async () => {
      productRepositoryMock.findById.mockResolvedValue(mockProduct);

      const result = await service.findById('product-uuid-1');

      expect(result).toBeInstanceOf(ProductEntity);
      expect(result.id).toBe('product-uuid-1');
      expect(result.name).toBe('iPhone 15 Pro Case — Clear MagSafe');
      expect(productRepositoryMock.findById).toHaveBeenCalledWith('product-uuid-1');
    });

    // TASK-254: the edit form's stock breakdown needs the derived reserved/physical.
    it('enriches the entity with the derived reserved/physical stock', async () => {
      productRepositoryMock.findById.mockResolvedValue(mockProduct);
      productRepositoryMock.getReservedQtyByProductId.mockResolvedValue(
        new Map([['product-uuid-1', 2]]),
      );

      const result = await service.findById('product-uuid-1');

      expect(result.reservedQty).toBe(2);
      expect(result.physicalQty).toBe(152); // 150 + 2
      expect(productRepositoryMock.getReservedQtyByProductId).toHaveBeenCalledWith([
        'product-uuid-1',
      ]);
    });

    it('should throw NotFoundException when product is not found', async () => {
      productRepositoryMock.findById.mockResolvedValue(null);

      await expect(service.findById('nonexistent-id')).rejects.toThrow(NotFoundException);
      expect(productRepositoryMock.findById).toHaveBeenCalledWith('nonexistent-id');
    });
  });

  // ─── findBySlugForAdminPreview (admin) ───────────────────────────────────────

  describe('findBySlugForAdminPreview', () => {
    const inactiveWithRelations = {
      ...mockInactiveProduct,
      category: { id: 'cat-1', name: 'Phone Cases', slug: 'phone-cases' },
      group: null,
      images: [],
    };

    it('should bypass the active filter via { activeOnly: false }', async () => {
      productRepositoryMock.findBySlugWithRelations.mockResolvedValue(inactiveWithRelations);

      await service.findBySlugForAdminPreview('discontinued-case');

      expect(productRepositoryMock.findBySlugWithRelations).toHaveBeenCalledWith(
        'discontinued-case',
        {
          activeOnly: false,
        },
      );
    });

    it('should return a full admin entity for a deactivated product', async () => {
      productRepositoryMock.findBySlugWithRelations.mockResolvedValue(inactiveWithRelations);

      const result = await service.findBySlugForAdminPreview('discontinued-case');

      expect(result).toHaveProperty('data');
      expect(result.data).toBeInstanceOf(ProductEntity);
      expect(result.data.isActive).toBe(false);
      expect(result.data.slug).toBe('discontinued-case');
      expect(result).toHaveProperty('category');
      expect(result).toHaveProperty('group');
      expect(result).toHaveProperty('images');
    });

    // TASK-254: the preview's stock rows need the derived reserved/physical.
    it('enriches the preview entity with the derived reserved/physical stock', async () => {
      productRepositoryMock.findBySlugWithRelations.mockResolvedValue(inactiveWithRelations);
      productRepositoryMock.getReservedQtyByProductId.mockResolvedValue(
        new Map([['product-uuid-2', 7]]),
      );

      const result = await service.findBySlugForAdminPreview('discontinued-case');

      expect(result.data.reservedQty).toBe(7);
      expect(result.data.physicalQty).toBe(157); // 150 + 7
      expect(productRepositoryMock.getReservedQtyByProductId).toHaveBeenCalledWith([
        'product-uuid-2',
      ]);
    });

    it('should NOT read or write the public detail cache', async () => {
      productRepositoryMock.findBySlugWithRelations.mockResolvedValue(inactiveWithRelations);

      await service.findBySlugForAdminPreview('discontinued-case');

      expect(cacheServiceMock.get).not.toHaveBeenCalled();
      expect(cacheServiceMock.set).not.toHaveBeenCalled();
    });

    it('should throw NotFoundException when the product is not found', async () => {
      productRepositoryMock.findBySlugWithRelations.mockResolvedValue(null);

      await expect(service.findBySlugForAdminPreview('missing')).rejects.toThrow(NotFoundException);
      expect(productRepositoryMock.findBySlugWithRelations).toHaveBeenCalledWith('missing', {
        activeOnly: false,
      });
    });
  });

  // ─── create (admin) ──────────────────────────────────────────────────────────

  describe('create', () => {
    const createInput: CreateProductInput = {
      name: 'iPhone 15 Pro Case — Clear MagSafe',
      slug: 'iphone-15-pro-case-clear-magsafe',
      price: 29.99,
      compareAtPrice: 39.99,
      sku: 'IP15-PRO-CASE-CLR',
      categoryId: 'category-uuid-1',
    };

    it('should create a product and return ProductEntity', async () => {
      productRepositoryMock.findBySlug.mockResolvedValue(null);
      productRepositoryMock.findBySku.mockResolvedValue(null);
      productRepositoryMock.create.mockResolvedValue(mockProduct);

      const result = await service.create(createInput);

      expect(result).toBeInstanceOf(ProductEntity);
      expect(result.name).toBe('iPhone 15 Pro Case — Clear MagSafe');
      expect(productRepositoryMock.create).toHaveBeenCalledWith(
        expect.objectContaining(createInput),
      );
    });

    // TASK-361: a new product is a hidden DRAFT unless the caller says otherwise.
    // Images, structured specs and device compat all need a product id, so a
    // product that went live on create was always live in its most incomplete
    // state.
    it('creates a hidden draft when isActive is omitted', async () => {
      productRepositoryMock.findBySlug.mockResolvedValue(null);
      productRepositoryMock.findBySku.mockResolvedValue(null);
      productRepositoryMock.create.mockResolvedValue({ ...mockProduct, isActive: false });

      await service.create(createInput);

      expect(productRepositoryMock.create).toHaveBeenCalledWith(
        expect.objectContaining({ isActive: false }),
      );
    });

    it('honours an explicit isActive=true (publishing straight from the API)', async () => {
      productRepositoryMock.findBySlug.mockResolvedValue(null);
      productRepositoryMock.findBySku.mockResolvedValue(null);
      productRepositoryMock.create.mockResolvedValue(mockProduct);

      await service.create({ ...createInput, isActive: true });

      expect(productRepositoryMock.create).toHaveBeenCalledWith(
        expect.objectContaining({ isActive: true }),
      );
    });

    it('sanitizes the description before persisting it (TASK-361)', async () => {
      productRepositoryMock.findBySlug.mockResolvedValue(null);
      productRepositoryMock.findBySku.mockResolvedValue(null);
      productRepositoryMock.create.mockResolvedValue(mockProduct);

      await service.create({
        ...createInput,
        description: '<p>Safe</p><script>alert(1)</script>',
      });

      const persisted = productRepositoryMock.create.mock.calls[0][0] as {
        description?: string | null;
      };
      expect(persisted.description).toBe('<p>Safe</p>');
    });

    it('leaves an absent description absent rather than turning it into empty HTML', async () => {
      productRepositoryMock.findBySlug.mockResolvedValue(null);
      productRepositoryMock.findBySku.mockResolvedValue(null);
      productRepositoryMock.create.mockResolvedValue(mockProduct);

      await service.create(createInput);

      const persisted = productRepositoryMock.create.mock.calls[0][0] as {
        description?: string | null;
      };
      expect(persisted.description).toBeUndefined();
    });

    it('should throw ConflictException when slug is already taken', async () => {
      productRepositoryMock.findBySlug.mockResolvedValue(mockProduct);

      await expect(service.create(createInput)).rejects.toThrow(ConflictException);
      expect(productRepositoryMock.create).not.toHaveBeenCalled();
    });

    it('should throw ConflictException when SKU is already taken', async () => {
      productRepositoryMock.findBySlug.mockResolvedValue(null);
      productRepositoryMock.findBySku.mockResolvedValue(mockProduct);

      await expect(service.create(createInput)).rejects.toThrow(ConflictException);
      expect(productRepositoryMock.create).not.toHaveBeenCalled();
    });

    it('should auto-generate slug from name when slug is not provided', async () => {
      const inputWithoutSlug: CreateProductInput = {
        name: 'iPhone 15 Pro Case',
        price: 29.99,
        categoryId: 'category-uuid-1',
      };
      productRepositoryMock.findBySlug.mockResolvedValue(null);
      productRepositoryMock.create.mockResolvedValue({
        ...mockProduct,
        slug: 'iphone-15-pro-case',
      });

      await service.create(inputWithoutSlug);

      expect(productRepositoryMock.findBySlug).toHaveBeenCalledWith('iphone-15-pro-case');
      expect(productRepositoryMock.create).toHaveBeenCalled();
    });

    it('should allow creating a product without SKU', async () => {
      const inputWithoutSku: CreateProductInput = {
        name: 'iPhone 15 Pro Case',
        slug: 'iphone-15-pro-case',
        price: 29.99,
        categoryId: 'category-uuid-1',
      };
      productRepositoryMock.findBySlug.mockResolvedValue(null);
      productRepositoryMock.create.mockResolvedValue({
        ...mockProduct,
        sku: null,
      });

      const result = await service.create(inputWithoutSku);

      expect(result).toBeInstanceOf(ProductEntity);
      // findBySku should NOT be called when sku is null/undefined
      expect(productRepositoryMock.findBySku).not.toHaveBeenCalled();
    });
  });

  // ─── update (admin) ───────────────────────────────────────────────────────────

  describe('update', () => {
    const updateInput: UpdateProductInput = {
      name: 'Updated Product Name',
      price: 24.99,
    };

    it('should update a product and return ProductEntity', async () => {
      const updatedProduct = {
        ...mockProduct,
        name: 'Updated Product Name',
        price: { toString: () => '24.99' },
        updatedAt: new Date('2026-05-05T12:00:00.000Z'),
      };
      productRepositoryMock.findById.mockResolvedValue(mockProduct);
      productRepositoryMock.update.mockResolvedValue(updatedProduct);

      const result = await service.update('product-uuid-1', updateInput);

      expect(result).toBeInstanceOf(ProductEntity);
      expect(result.name).toBe('Updated Product Name');
      // No slug change → no slugRename forwarded (third arg undefined).
      expect(productRepositoryMock.update).toHaveBeenCalledWith(
        'product-uuid-1',
        updateInput,
        undefined,
      );
    });

    it('should throw NotFoundException when product is not found', async () => {
      productRepositoryMock.findById.mockResolvedValue(null);

      await expect(service.update('nonexistent-id', updateInput)).rejects.toThrow(
        NotFoundException,
      );
      expect(productRepositoryMock.update).not.toHaveBeenCalled();
    });

    it('sanitizes the description on update (TASK-361)', async () => {
      productRepositoryMock.findById.mockResolvedValue(mockProduct);
      productRepositoryMock.update.mockResolvedValue(mockProduct);

      await service.update('product-uuid-1', {
        description: '<p>Kept</p><script>alert(1)</script>',
      });

      expect(productRepositoryMock.update).toHaveBeenCalledWith(
        'product-uuid-1',
        { description: '<p>Kept</p>' },
        undefined,
      );
    });

    // A partial update that does not mention `description` must not blank it —
    // `undefined` has to survive the sanitize step as `undefined`, not "".
    it('leaves the description untouched when the update omits it', async () => {
      productRepositoryMock.findById.mockResolvedValue(mockProduct);
      productRepositoryMock.update.mockResolvedValue(mockProduct);

      await service.update('product-uuid-1', { price: 24.99 });

      expect(productRepositoryMock.update).toHaveBeenCalledWith(
        'product-uuid-1',
        { price: 24.99 },
        undefined,
      );
    });

    it('should throw ConflictException when updating slug to one already taken', async () => {
      const updateWithSlug: UpdateProductInput = {
        slug: 'taken-slug',
      };
      productRepositoryMock.findById.mockResolvedValue(mockProduct);
      productRepositoryMock.findBySlug.mockResolvedValue({
        ...mockProduct,
        id: 'other-product-id',
        slug: 'taken-slug',
      });

      await expect(service.update('product-uuid-1', updateWithSlug)).rejects.toThrow(
        ConflictException,
      );
      expect(productRepositoryMock.update).not.toHaveBeenCalled();
    });

    it('should allow keeping the same slug without conflict', async () => {
      const updateWithSameSlug: UpdateProductInput = {
        slug: 'iphone-15-pro-case-clear-magsafe', // same as current
      };
      productRepositoryMock.findById.mockResolvedValue(mockProduct);
      productRepositoryMock.findBySlug.mockResolvedValue(mockProduct); // same product
      productRepositoryMock.update.mockResolvedValue(mockProduct);

      const result = await service.update('product-uuid-1', updateWithSameSlug);

      expect(result).toBeInstanceOf(ProductEntity);
      expect(productRepositoryMock.update).toHaveBeenCalled();
    });

    it('should throw ConflictException when updating SKU to one already taken', async () => {
      const updateWithSku: UpdateProductInput = {
        sku: 'TAKEN-SKU',
      };
      productRepositoryMock.findById.mockResolvedValue(mockProduct);
      productRepositoryMock.findBySku.mockResolvedValue({
        ...mockProduct,
        id: 'other-product-id',
        sku: 'TAKEN-SKU',
      });

      await expect(service.update('product-uuid-1', updateWithSku)).rejects.toThrow(
        ConflictException,
      );
      expect(productRepositoryMock.update).not.toHaveBeenCalled();
    });

    it('records a slug redirect when renaming an ACTIVE product', async () => {
      productRepositoryMock.findById.mockResolvedValue(mockProduct); // isActive: true
      productRepositoryMock.findBySlug.mockResolvedValue(null);
      productRepositoryMock.update.mockResolvedValue({ ...mockProduct, slug: 'new-slug' });

      await service.update('product-uuid-1', { slug: 'new-slug' });

      expect(productRepositoryMock.update).toHaveBeenCalledWith(
        'product-uuid-1',
        expect.objectContaining({ slug: 'new-slug' }),
        { oldSlug: 'iphone-15-pro-case-clear-magsafe', newSlug: 'new-slug' },
      );
    });

    it('does NOT record a redirect when renaming an INACTIVE product', async () => {
      productRepositoryMock.findById.mockResolvedValue(mockInactiveProduct); // isActive: false
      productRepositoryMock.findBySlug.mockResolvedValue(null);
      productRepositoryMock.update.mockResolvedValue({ ...mockInactiveProduct, slug: 'new-slug' });

      await service.update('product-uuid-2', { slug: 'new-slug' });

      expect(productRepositoryMock.update).toHaveBeenCalledWith(
        'product-uuid-2',
        expect.objectContaining({ slug: 'new-slug' }),
        undefined,
      );
    });

    it('still records the redirect when renaming AND deactivating in the same call (pre-write snapshot)', async () => {
      productRepositoryMock.findById.mockResolvedValue(mockProduct); // isActive: true BEFORE the write
      productRepositoryMock.findBySlug.mockResolvedValue(null);
      productRepositoryMock.update.mockResolvedValue({
        ...mockProduct,
        slug: 'new-slug',
        isActive: false,
      });

      await service.update('product-uuid-1', { slug: 'new-slug', isActive: false });

      expect(productRepositoryMock.update).toHaveBeenCalledWith(
        'product-uuid-1',
        expect.objectContaining({ slug: 'new-slug', isActive: false }),
        { oldSlug: 'iphone-15-pro-case-clear-magsafe', newSlug: 'new-slug' },
      );
    });
  });

  // ─── deactivate (admin) ──────────────────────────────────────────────────────

  describe('deactivate', () => {
    it('should set isActive to false and return ProductEntity', async () => {
      productRepositoryMock.findById.mockResolvedValue(mockProduct);
      productRepositoryMock.deactivate.mockResolvedValue(mockInactiveProduct);

      const result = await service.deactivate('product-uuid-2');

      expect(result).toBeInstanceOf(ProductEntity);
      expect(result.isActive).toBe(false);
      expect(productRepositoryMock.findById).toHaveBeenCalledWith('product-uuid-2');
      expect(productRepositoryMock.deactivate).toHaveBeenCalledWith('product-uuid-2');
    });

    it('should throw NotFoundException when product is not found', async () => {
      productRepositoryMock.findById.mockResolvedValue(null);

      await expect(service.deactivate('nonexistent-id')).rejects.toThrow(NotFoundException);
      expect(productRepositoryMock.deactivate).not.toHaveBeenCalled();
    });
  });

  // ─── setStatusMany (admin, TASK-355) ─────────────────────────────────────────

  describe('setStatusMany', () => {
    const updated = [
      { id: 'product-uuid-1', slug: 'iphone-15-pro-case', isActive: false },
      { id: 'product-uuid-2', slug: 'galaxy-s24-case', isActive: false },
    ];

    it('performs the SAME side effects the per-row toggle does, for every row', async () => {
      productRepositoryMock.setActiveMany.mockResolvedValue(updated);

      const count = await service.setStatusMany(['product-uuid-1', 'product-uuid-2'], false);

      expect(count).toBe(2);
      expect(productRepositoryMock.setActiveMany).toHaveBeenCalledWith(
        ['product-uuid-1', 'product-uuid-2'],
        false,
      );

      // Detail cache evicted by BOTH id and slug, per product — the same two
      // keys `deactivate` clears. A bulk path that dropped one of them would
      // leave a stale PDP served under the other.
      expect(cacheServiceMock.del).toHaveBeenCalledWith(expect.stringContaining('product-uuid-1'));
      expect(cacheServiceMock.del).toHaveBeenCalledWith(
        expect.stringContaining('iphone-15-pro-case'),
      );
      expect(cacheServiceMock.del).toHaveBeenCalledWith(expect.stringContaining('product-uuid-2'));
      expect(cacheServiceMock.del).toHaveBeenCalledWith(expect.stringContaining('galaxy-s24-case'));

      // Deactivated products leave the search index.
      expect(productIndexerMock.remove).toHaveBeenCalledWith('product-uuid-1');
      expect(productIndexerMock.remove).toHaveBeenCalledWith('product-uuid-2');
      expect(productIndexerMock.index).not.toHaveBeenCalled();
    });

    it('re-indexes instead of removing when activating', async () => {
      productRepositoryMock.setActiveMany.mockResolvedValue(
        updated.map((row) => ({ ...row, isActive: true })),
      );

      await service.setStatusMany(['product-uuid-1', 'product-uuid-2'], true);

      expect(productIndexerMock.index).toHaveBeenCalledWith('product-uuid-1');
      expect(productIndexerMock.index).toHaveBeenCalledWith('product-uuid-2');
      expect(productIndexerMock.remove).not.toHaveBeenCalled();
    });

    it('evicts the list prefix once, not once per product', async () => {
      productRepositoryMock.setActiveMany.mockResolvedValue(updated);

      await service.setStatusMany(['product-uuid-1', 'product-uuid-2'], false);

      expect(cacheServiceMock.delByPrefix).toHaveBeenCalledTimes(1);
    });

    it('maps the repository domain error to 404 and touches no cache', async () => {
      productRepositoryMock.setActiveMany.mockRejectedValue(
        new ProductsNotFoundError(['missing-uuid']),
      );

      await expect(
        service.setStatusMany(['product-uuid-1', 'missing-uuid'], false),
      ).rejects.toThrow(NotFoundException);

      // The write was rolled back, so nothing downstream may have run — an
      // eviction here would mean the service acted on a batch that never landed.
      expect(cacheServiceMock.delByPrefix).not.toHaveBeenCalled();
      expect(productIndexerMock.index).not.toHaveBeenCalled();
      expect(productIndexerMock.remove).not.toHaveBeenCalled();
    });

    it('lets an unexpected repository failure through untouched', async () => {
      const boom = new Error('connection reset');
      productRepositoryMock.setActiveMany.mockRejectedValue(boom);

      await expect(service.setStatusMany(['product-uuid-1'], true)).rejects.toThrow(boom);
    });
  });

  // ─── activate (admin) ────────────────────────────────────────────────────────

  describe('activate', () => {
    it('should set isActive to true and return ProductEntity', async () => {
      productRepositoryMock.findById.mockResolvedValue(mockInactiveProduct);
      productRepositoryMock.activate.mockResolvedValue({
        ...mockInactiveProduct,
        isActive: true,
      });

      const result = await service.activate('product-uuid-2');

      expect(result).toBeInstanceOf(ProductEntity);
      expect(result.isActive).toBe(true);
      expect(productRepositoryMock.findById).toHaveBeenCalledWith('product-uuid-2');
      expect(productRepositoryMock.activate).toHaveBeenCalledWith('product-uuid-2');
    });

    it('should throw NotFoundException when product is not found', async () => {
      productRepositoryMock.findById.mockResolvedValue(null);

      await expect(service.activate('nonexistent-id')).rejects.toThrow(NotFoundException);
      expect(productRepositoryMock.activate).not.toHaveBeenCalled();
    });
  });

  // ─── caching (cache-aside reads) ──────────────────────────────────────────────

  describe('caching — findAll', () => {
    const query: ProductListQueryDto = { page: 1, limit: 20 };

    it('returns the cached value on HIT without querying the repository', async () => {
      const cachedResponse = { data: [], meta: { total: 0, page: 1, limit: 20, totalPages: 0 } };
      cacheServiceMock.get.mockResolvedValue(cachedResponse);

      const result = await service.findAll(query);

      expect(result).toBe(cachedResponse);
      expect(productRepositoryMock.findAll).not.toHaveBeenCalled();
      expect(cacheServiceMock.set).not.toHaveBeenCalled();
    });

    it('queries the repository and caches the result on MISS', async () => {
      cacheServiceMock.get.mockResolvedValue(null);
      productRepositoryMock.findAll.mockResolvedValue({ products: [mockProduct], total: 1 });

      const result = await service.findAll(query);

      expect(productRepositoryMock.findAll).toHaveBeenCalledTimes(1);
      const expectedKey = buildProductListKey({
        page: 1,
        limit: 20,
        categoryId: undefined,
        // TASK-230: public list keys always carry the forced active-only filter.
        isActive: true,
        minPrice: undefined,
        maxPrice: undefined,
        search: undefined,
        sortBy: 'createdAt',
        sortOrder: 'desc',
      });
      expect(cacheServiceMock.get).toHaveBeenCalledWith(expectedKey);
      expect(cacheServiceMock.set).toHaveBeenCalledWith(expectedKey, result, 300);
    });

    it('falls through to the DB when the cache errors (get returns null)', async () => {
      // CacheService.get swallows errors and returns null, so the service simply
      // sees a miss and queries the DB.
      cacheServiceMock.get.mockResolvedValue(null);
      productRepositoryMock.findAll.mockResolvedValue({ products: [], total: 0 });

      await service.findAll(query);

      expect(productRepositoryMock.findAll).toHaveBeenCalledTimes(1);
    });
  });

  describe('caching — findBySlug', () => {
    const slug = 'iphone-15-pro-case-clear-magsafe';
    const productWithRelations = {
      ...mockProduct,
      category: { id: 'cat-1', name: 'Phone Cases', slug: 'phone-cases' },
      group: null,
      images: [],
    };

    it('returns the cached value on HIT without querying the repository', async () => {
      const cached = { data: {}, category: {}, group: null, images: [] };
      cacheServiceMock.get.mockResolvedValue(cached);

      const result = await service.findBySlug(slug);

      expect(result).toBe(cached);
      expect(productRepositoryMock.findBySlugWithRelations).not.toHaveBeenCalled();
    });

    it('queries and caches under the slug detail key on MISS', async () => {
      cacheServiceMock.get.mockResolvedValue(null);
      productRepositoryMock.findBySlugWithRelations.mockResolvedValue(productWithRelations);

      const result = await service.findBySlug(slug);

      expect(cacheServiceMock.get).toHaveBeenCalledWith(productDetailSlugKey(slug));
      expect(cacheServiceMock.set).toHaveBeenCalledWith(productDetailSlugKey(slug), result, 300);
    });

    it('does not cache a not-found result', async () => {
      cacheServiceMock.get.mockResolvedValue(null);
      productRepositoryMock.findBySlugWithRelations.mockResolvedValue(null);

      await expect(service.findBySlug('missing')).rejects.toThrow(NotFoundException);
      expect(cacheServiceMock.set).not.toHaveBeenCalled();
    });
  });

  describe('caching — findById', () => {
    it('returns the cached value on HIT without querying the repository', async () => {
      const cached = ProductEntity.fromPrisma(mockProduct);
      cacheServiceMock.get.mockResolvedValue(cached);

      const result = await service.findById('product-uuid-1');

      expect(result).toBe(cached);
      expect(productRepositoryMock.findById).not.toHaveBeenCalled();
    });

    it('queries and caches under the id detail key on MISS', async () => {
      cacheServiceMock.get.mockResolvedValue(null);
      productRepositoryMock.findById.mockResolvedValue(mockProduct);

      const result = await service.findById('product-uuid-1');

      expect(cacheServiceMock.get).toHaveBeenCalledWith(productDetailIdKey('product-uuid-1'));
      expect(cacheServiceMock.set).toHaveBeenCalledWith(
        productDetailIdKey('product-uuid-1'),
        result,
        300,
      );
    });
  });

  // ─── cache invalidation (writes) ──────────────────────────────────────────────

  describe('cache invalidation', () => {
    it('create evicts all list pages', async () => {
      productRepositoryMock.findBySlug.mockResolvedValue(null);
      productRepositoryMock.findBySku.mockResolvedValue(null);
      productRepositoryMock.create.mockResolvedValue(mockProduct);

      await service.create({
        name: 'New Product',
        slug: 'new-product',
        price: 10,
        categoryId: 'category-uuid-1',
      });

      expect(cacheServiceMock.delByPrefix).toHaveBeenCalledWith(PRODUCT_LIST_PREFIX);
    });

    it('update evicts list pages and both detail variants (slug unchanged)', async () => {
      productRepositoryMock.findById.mockResolvedValue(mockProduct);
      productRepositoryMock.update.mockResolvedValue(mockProduct);

      await service.update('product-uuid-1', { name: 'Renamed' });

      expect(cacheServiceMock.delByPrefix).toHaveBeenCalledWith(PRODUCT_LIST_PREFIX);
      expect(cacheServiceMock.del).toHaveBeenCalledWith(productDetailIdKey('product-uuid-1'));
      expect(cacheServiceMock.del).toHaveBeenCalledWith(productDetailSlugKey(mockProduct.slug));
    });

    it('update also evicts the new slug key when the slug changes', async () => {
      productRepositoryMock.findById.mockResolvedValue(mockProduct);
      productRepositoryMock.findBySlug.mockResolvedValue(null);
      productRepositoryMock.update.mockResolvedValue({ ...mockProduct, slug: 'brand-new-slug' });

      await service.update('product-uuid-1', { slug: 'brand-new-slug' });

      expect(cacheServiceMock.del).toHaveBeenCalledWith(productDetailSlugKey(mockProduct.slug));
      expect(cacheServiceMock.del).toHaveBeenCalledWith(productDetailSlugKey('brand-new-slug'));
    });

    it('deactivate evicts list pages and both detail variants', async () => {
      productRepositoryMock.findById.mockResolvedValue(mockProduct);
      productRepositoryMock.deactivate.mockResolvedValue(mockInactiveProduct);

      await service.deactivate('product-uuid-1');

      expect(cacheServiceMock.delByPrefix).toHaveBeenCalledWith(PRODUCT_LIST_PREFIX);
      expect(cacheServiceMock.del).toHaveBeenCalledWith(productDetailIdKey('product-uuid-1'));
      expect(cacheServiceMock.del).toHaveBeenCalledWith(productDetailSlugKey(mockProduct.slug));
    });

    it('activate evicts list pages and both detail variants', async () => {
      productRepositoryMock.findById.mockResolvedValue(mockInactiveProduct);
      productRepositoryMock.activate.mockResolvedValue({ ...mockInactiveProduct, isActive: true });

      await service.activate('product-uuid-2');

      expect(cacheServiceMock.delByPrefix).toHaveBeenCalledWith(PRODUCT_LIST_PREFIX);
      expect(cacheServiceMock.del).toHaveBeenCalledWith(productDetailIdKey('product-uuid-2'));
      expect(cacheServiceMock.del).toHaveBeenCalledWith(
        productDetailSlugKey(mockInactiveProduct.slug),
      );
    });
  });

  // ─── storefront revalidation (TASK-384) ──────────────────────────────────────
  //
  // Evicting Redis is only half of a product write. The storefront's HOMEPAGE is
  // statically prerendered and bakes each carousel's resolved product list —
  // name, price, image — into that HTML. Before this, the Redis half fired at
  // all nine mutation sites and the storefront half at none, so an admin price
  // change reached /products within seconds and the homepage kept the old number
  // until its ISR timer happened to expire, 0–60 minutes later. That reads as
  // "the feature does not work", which is exactly how it was reported.

  describe('storefront revalidation', () => {
    it.each([
      [
        'create',
        async () => {
          productRepositoryMock.findBySlug.mockResolvedValue(null);
          productRepositoryMock.findBySku.mockResolvedValue(null);
          productRepositoryMock.create.mockResolvedValue(mockProduct);
          await service.create({
            name: 'New Product',
            slug: 'new-product',
            price: 10,
            categoryId: 'category-uuid-1',
          });
        },
      ],
      [
        'update',
        async () => {
          productRepositoryMock.findById.mockResolvedValue(mockProduct);
          productRepositoryMock.update.mockResolvedValue(mockProduct);
          await service.update('product-uuid-1', { price: 999 });
        },
      ],
      [
        'deactivate',
        async () => {
          productRepositoryMock.findById.mockResolvedValue(mockProduct);
          productRepositoryMock.deactivate.mockResolvedValue(mockInactiveProduct);
          await service.deactivate('product-uuid-1');
        },
      ],
      [
        'delete',
        async () => {
          productRepositoryMock.findById.mockResolvedValue(mockProduct);
          productRepositoryMock.softDelete.mockResolvedValue({ ...mockProduct, isActive: false });
          await service.delete('product-uuid-1');
        },
      ],
    ])('%s purges the storefront homepage', async (_label, run) => {
      await run();

      expect(revalidationMock.revalidate).toHaveBeenCalledWith(CATALOGUE_REVALIDATE_TARGET);
    });

    // The two halves are one obligation. If a future edit reintroduces a bare
    // `delByPrefix(PRODUCT_LIST_PREFIX)` at a new mutation site, this fails.
    it('purges Redis and the storefront the same number of times', async () => {
      productRepositoryMock.findById.mockResolvedValue(mockProduct);
      productRepositoryMock.update.mockResolvedValue(mockProduct);

      await service.update('product-uuid-1', { price: 999 });

      expect(revalidationMock.revalidate).toHaveBeenCalledTimes(
        cacheServiceMock.delByPrefix.mock.calls.length,
      );
    });

    // A storefront that is down, slow or unconfigured must never fail an admin
    // write. The notifier swallows its own errors; this proves the service does
    // not reintroduce the failure by awaiting it unguarded.
    it('still completes the write when the storefront purge rejects', async () => {
      revalidationMock.revalidate.mockRejectedValueOnce(new Error('ECONNREFUSED'));
      productRepositoryMock.findById.mockResolvedValue(mockProduct);
      productRepositoryMock.update.mockResolvedValue(mockProduct);

      await expect(service.update('product-uuid-1', { price: 999 })).resolves.toBeInstanceOf(
        ProductEntity,
      );
    });

    it('does not purge on a read', async () => {
      productRepositoryMock.findAll.mockResolvedValue({ products: [mockProduct], total: 1 });

      await service.findAll({ page: 1, limit: 20 });

      expect(revalidationMock.revalidate).not.toHaveBeenCalled();
    });
  });

  // ─── delete (soft-delete, TASK-104) ──────────────────────────────────────────

  describe('delete', () => {
    it('should soft-delete with mangled slug/sku and evict caches', async () => {
      productRepositoryMock.findById.mockResolvedValue(mockProduct);
      productRepositoryMock.softDelete.mockResolvedValue({
        ...mockProduct,
        isActive: false,
      });

      const result = await service.delete('product-uuid-1');

      expect(productRepositoryMock.softDelete).toHaveBeenCalledWith(
        'product-uuid-1',
        `deleted:${mockProduct.id}:${mockProduct.slug}`,
        `deleted:${mockProduct.id}:${mockProduct.sku}`,
      );
      expect(cacheServiceMock.delByPrefix).toHaveBeenCalledWith(PRODUCT_LIST_PREFIX);
      expect(cacheServiceMock.del).toHaveBeenCalledWith(productDetailIdKey('product-uuid-1'));
      expect(cacheServiceMock.del).toHaveBeenCalledWith(productDetailSlugKey(mockProduct.slug));
      expect(result).toBeInstanceOf(ProductEntity);
    });

    it('never goes through update() — the mangled tombstone slug must not record a redirect', async () => {
      productRepositoryMock.findById.mockResolvedValue(mockProduct);
      productRepositoryMock.softDelete.mockResolvedValue({
        ...mockProduct,
        isActive: false,
      });

      await service.delete('product-uuid-1');

      // delete() uses the dedicated softDelete write — the slugRename-capable
      // update() path (and thus SlugRedirectRepository.recordRename) is never hit.
      expect(productRepositoryMock.update).not.toHaveBeenCalled();
    });

    it('should pass a null mangled sku when the product has no sku', async () => {
      productRepositoryMock.findById.mockResolvedValue({ ...mockProduct, sku: null });
      productRepositoryMock.softDelete.mockResolvedValue({
        ...mockProduct,
        sku: null,
        isActive: false,
      });

      await service.delete('product-uuid-1');

      expect(productRepositoryMock.softDelete).toHaveBeenCalledWith(
        'product-uuid-1',
        `deleted:${mockProduct.id}:${mockProduct.slug}`,
        null,
      );
    });

    it('should throw NotFoundException when the product does not exist', async () => {
      productRepositoryMock.findById.mockResolvedValue(null);

      await expect(service.delete('missing')).rejects.toThrow(NotFoundException);
      expect(productRepositoryMock.softDelete).not.toHaveBeenCalled();
    });

    it('should not expose deletedAt on the returned entity', async () => {
      productRepositoryMock.findById.mockResolvedValue(mockProduct);
      productRepositoryMock.softDelete.mockResolvedValue({
        ...mockProduct,
        isActive: false,
        deletedAt: new Date(),
      });

      const result = await service.delete('product-uuid-1');

      expect(result).not.toHaveProperty('deletedAt');
    });
  });

  // ─── search-index sync (TASK-075) ────────────────────────────────────────────
  // Every mutation keeps the Meilisearch index in step via the ProductIndexer:
  // active products are (re)indexed, inactive ones removed. Sync is best-effort
  // and must NEVER fail the product write.

  describe('search-index sync', () => {
    it('indexes an active product on create', async () => {
      productRepositoryMock.findBySlug.mockResolvedValue(null);
      productRepositoryMock.findBySku.mockResolvedValue(null);
      productRepositoryMock.create.mockResolvedValue(mockProduct);

      await service.create({
        name: 'New Product',
        slug: 'new-product',
        price: 10,
        categoryId: 'category-uuid-1',
      });

      expect(productIndexerMock.index).toHaveBeenCalledWith(mockProduct.id);
      expect(productIndexerMock.remove).not.toHaveBeenCalled();
    });

    it('removes the product from the index when created inactive', async () => {
      productRepositoryMock.findBySlug.mockResolvedValue(null);
      productRepositoryMock.findBySku.mockResolvedValue(null);
      productRepositoryMock.create.mockResolvedValue({ ...mockProduct, isActive: false });

      await service.create({
        name: 'Hidden Product',
        slug: 'hidden-product',
        price: 10,
        categoryId: 'category-uuid-1',
        isActive: false,
      });

      expect(productIndexerMock.remove).toHaveBeenCalledWith(mockProduct.id);
      expect(productIndexerMock.index).not.toHaveBeenCalled();
    });

    it('re-indexes on update when the product remains active', async () => {
      productRepositoryMock.findById.mockResolvedValue(mockProduct);
      productRepositoryMock.update.mockResolvedValue(mockProduct);

      await service.update('product-uuid-1', { name: 'Renamed' });

      expect(productIndexerMock.index).toHaveBeenCalledWith(mockProduct.id);
    });

    it('indexes on activate and removes on deactivate', async () => {
      productRepositoryMock.findById.mockResolvedValue(mockInactiveProduct);
      productRepositoryMock.activate.mockResolvedValue({ ...mockInactiveProduct, isActive: true });
      await service.activate('product-uuid-2');
      expect(productIndexerMock.index).toHaveBeenCalledWith('product-uuid-2');

      jest.clearAllMocks();

      productRepositoryMock.findById.mockResolvedValue(mockProduct);
      productRepositoryMock.deactivate.mockResolvedValue(mockInactiveProduct);
      await service.deactivate('product-uuid-1');
      expect(productIndexerMock.remove).toHaveBeenCalledWith(mockInactiveProduct.id);
    });

    it('removes the product from the index on soft-delete', async () => {
      productRepositoryMock.findById.mockResolvedValue(mockProduct);
      productRepositoryMock.softDelete.mockResolvedValue({ ...mockProduct, isActive: false });

      await service.delete('product-uuid-1');

      expect(productIndexerMock.remove).toHaveBeenCalledWith(mockProduct.id);
    });

    it('does NOT fail the mutation when the indexer throws', async () => {
      productRepositoryMock.findBySlug.mockResolvedValue(null);
      productRepositoryMock.findBySku.mockResolvedValue(null);
      productRepositoryMock.create.mockResolvedValue(mockProduct);
      productIndexerMock.index.mockRejectedValue(new Error('meili down'));

      const result = await service.create({
        name: 'New Product',
        slug: 'new-product',
        price: 10,
        categoryId: 'category-uuid-1',
      });

      expect(result).toBeInstanceOf(ProductEntity);
    });
  });

  // ─── device compatibility (TASK-190) ─────────────────────────────────────────

  describe('updateDeviceCompat', () => {
    it('rejects unknown device model ids with a 400 before writing', async () => {
      productRepositoryMock.findById.mockResolvedValue(mockProduct);
      // Only 'm1' exists; 'ghost' is unknown.
      deviceRepositoryMock.findModelsByIds.mockResolvedValue([{ id: 'm1' }]);

      await expect(service.updateDeviceCompat(mockProduct.id, ['m1', 'ghost'])).rejects.toThrow(
        BadRequestException,
      );
      expect(deviceCompatRepositoryMock.setDeviceCompat).not.toHaveBeenCalled();
    });

    it('throws NotFoundException when the product does not exist', async () => {
      productRepositoryMock.findById.mockResolvedValue(null);

      await expect(service.updateDeviceCompat('ghost', [])).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('replaces the compat set and returns the enriched product', async () => {
      productRepositoryMock.findById.mockResolvedValue(mockProduct);
      deviceRepositoryMock.findModelsByIds.mockResolvedValue([{ id: 'm1' }]);
      deviceCompatRepositoryMock.getDeviceCompat.mockResolvedValue([
        { id: 'm1', name: 'iPhone 15', slug: 'iphone-15', brandName: 'Apple' },
      ]);

      const result = await service.updateDeviceCompat(mockProduct.id, ['m1']);

      expect(deviceCompatRepositoryMock.setDeviceCompat).toHaveBeenCalledWith(mockProduct.id, [
        'm1',
      ]);
      expect(result.compatibleDeviceModels).toHaveLength(1);
      expect(result.compatibleDeviceModels[0]).toMatchObject({ id: 'm1', brandName: 'Apple' });
    });

    it('accepts an empty set (clears compat) without validating ids', async () => {
      productRepositoryMock.findById.mockResolvedValue(mockProduct);

      await service.updateDeviceCompat(mockProduct.id, []);

      expect(deviceRepositoryMock.findModelsByIds).not.toHaveBeenCalled();
      expect(deviceCompatRepositoryMock.setDeviceCompat).toHaveBeenCalledWith(mockProduct.id, []);
    });
  });

  describe('updateGroupDeviceCompat', () => {
    it('throws NotFoundException when the group has no positions', async () => {
      deviceCompatRepositoryMock.countGroupPositions.mockResolvedValue(0);

      await expect(service.updateGroupDeviceCompat('g1', ['m1'])).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(deviceCompatRepositoryMock.setDeviceCompatForGroup).not.toHaveBeenCalled();
    });

    it('applies the set to all positions and returns the updated count', async () => {
      deviceCompatRepositoryMock.countGroupPositions.mockResolvedValue(3);
      deviceRepositoryMock.findModelsByIds.mockResolvedValue([{ id: 'm1' }]);
      deviceCompatRepositoryMock.setDeviceCompatForGroup.mockResolvedValue({
        updatedCount: 3,
        productIds: ['p1', 'p2', 'p3'],
      });

      const result = await service.updateGroupDeviceCompat('g1', ['m1']);

      expect(result).toEqual({ updatedCount: 3 });
      expect(deviceCompatRepositoryMock.setDeviceCompatForGroup).toHaveBeenCalledWith('g1', ['m1']);
    });
  });

  // ─── updateSpecs (TASK-191) ────────────────────────────────────────────────

  describe('updateSpecs', () => {
    const materialDef = {
      id: 'def-material',
      categoryId: 'category-uuid-1',
      key: 'material',
      label: 'Матеріал',
      type: 'SELECT',
      unit: null,
      options: ['Силікон', 'Шкіра'],
      isFilterable: true,
      sortOrder: 0,
    };
    const powerDef = {
      id: 'def-power',
      categoryId: 'category-uuid-1',
      key: 'power',
      label: 'Потужність',
      type: 'NUMBER',
      unit: 'W',
      options: null,
      isFilterable: false,
      sortOrder: 1,
    };

    it('404s when the product does not exist', async () => {
      productRepositoryMock.findById.mockResolvedValue(null);

      await expect(
        service.updateSpecs('ghost', [{ definitionId: 'def-material', value: 'Силікон' }]),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(specRepositoryMock.setSpecs).not.toHaveBeenCalled();
    });

    it('rejects a definitionId outside the effective set (400, no write)', async () => {
      productRepositoryMock.findById.mockResolvedValue(mockProduct);
      attributeDefinitionRepositoryMock.findEffectiveForCategory.mockResolvedValue([materialDef]);

      await expect(
        service.updateSpecs('product-uuid-1', [{ definitionId: 'def-unknown', value: 'x' }]),
      ).rejects.toMatchObject({ status: 400 });
      expect(specRepositoryMock.setSpecs).not.toHaveBeenCalled();
    });

    it('rejects a non-numeric value for a NUMBER definition (400)', async () => {
      productRepositoryMock.findById.mockResolvedValue(mockProduct);
      attributeDefinitionRepositoryMock.findEffectiveForCategory.mockResolvedValue([powerDef]);

      await expect(
        service.updateSpecs('product-uuid-1', [{ definitionId: 'def-power', value: 'abc' }]),
      ).rejects.toMatchObject({ status: 400 });
      expect(specRepositoryMock.setSpecs).not.toHaveBeenCalled();
    });

    it('rejects a value outside options for a SELECT definition (400)', async () => {
      productRepositoryMock.findById.mockResolvedValue(mockProduct);
      attributeDefinitionRepositoryMock.findEffectiveForCategory.mockResolvedValue([materialDef]);

      await expect(
        service.updateSpecs('product-uuid-1', [{ definitionId: 'def-material', value: 'Метал' }]),
      ).rejects.toMatchObject({ status: 400 });
      expect(specRepositoryMock.setSpecs).not.toHaveBeenCalled();
    });

    it('persists valid values (SELECT + NUMBER with numeric mirror) and hydrates specs', async () => {
      productRepositoryMock.findById.mockResolvedValue(mockProduct);
      attributeDefinitionRepositoryMock.findEffectiveForCategory.mockResolvedValue([
        materialDef,
        powerDef,
      ]);
      specRepositoryMock.getSpecs.mockResolvedValue([
        { value: 'Силікон', definition: materialDef },
      ]);

      const result = await service.updateSpecs('product-uuid-1', [
        { definitionId: 'def-material', value: 'Силікон' },
        { definitionId: 'def-power', value: '20' },
      ]);

      expect(specRepositoryMock.setSpecs).toHaveBeenCalledWith('product-uuid-1', [
        { definitionId: 'def-material', value: 'Силікон' },
        { definitionId: 'def-power', value: '20', valueNumber: 20 },
      ]);
      expect(result).toBeInstanceOf(ProductEntity);
      expect(result.specs).toHaveLength(1);
      expect(cacheServiceMock.delByPrefix).toHaveBeenCalledWith(PRODUCT_LIST_PREFIX);
    });

    it('drops blank values so a full effective set can be submitted', async () => {
      productRepositoryMock.findById.mockResolvedValue(mockProduct);
      attributeDefinitionRepositoryMock.findEffectiveForCategory.mockResolvedValue([
        materialDef,
        powerDef,
      ]);

      await service.updateSpecs('product-uuid-1', [
        { definitionId: 'def-material', value: 'Силікон' },
        { definitionId: 'def-power', value: '' },
      ]);

      expect(specRepositoryMock.setSpecs).toHaveBeenCalledWith('product-uuid-1', [
        { definitionId: 'def-material', value: 'Силікон' },
      ]);
    });
  });
});
