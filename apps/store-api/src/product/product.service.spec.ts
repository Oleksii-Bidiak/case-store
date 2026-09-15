import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, ConflictException, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  ProductRepository,
  ProductGroupNotFoundError,
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
import {
  CatalogueFilterResolver,
  UNRESOLVED_FILTER_ID,
  UNRESOLVED_FILTER_KEY,
} from '../catalog-filter/catalogue-filter.resolver';

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
  // TASK-423: bulk variant-group reassignment. Resolves the two-part shape the
  // real repository returns — the rows it wrote plus the untouched siblings whose
  // cached `variantSiblings` the write invalidated.
  setGroupMany: jest.fn(),
  // TASK-487: bulk colour. The two-step shape the real repository needs — read
  // the categories first so the service can resolve a definition per product,
  // then write the axis JSON and the spec value together.
  findCategoriesForBulk: jest.fn(),
  setColorMany: jest.fn(),
  softDelete: jest.fn(),
  // TASK-254: derived reserved-qty aggregate. Defaults to an empty map (no
  // reservations); individual tests override to assert the enrichment.
  getReservedQtyByProductId: jest.fn().mockResolvedValue(new Map<string, number>()),
};

// ─── CategoryRepository mock (TASK-236 subtree rollup) ────────────────────────
// `findSubtreeIds` echoes back a single-element subtree by default; individual
// tests override it to simulate a real parent → subcategory expansion.
// `findById`/`findBySlug` back the REAL CatalogueFilterResolver (TASK-420) — the
// service is wired to the genuine resolver here rather than a stub, so these
// tests still exercise the slug → id step instead of asserting against a mock of
// the very thing under test. Both echo the requested key back as a resolved row,
// so an id filter passes through unchanged and the pre-TASK-420 expectations
// hold; tests override them with `null` to exercise the unresolved path.
const categoryRepositoryMock = {
  findSubtreeIds: jest.fn((id: string) => Promise.resolve([id])),
  findById: jest.fn((id: string) => Promise.resolve({ id, slug: `slug-of-${id}` })),
  findBySlug: jest.fn((slug: string) => Promise.resolve({ id: `id-of-${slug}`, slug })),
};

// ─── BrandRepository mock (TASK-189 brand validation on create/update) ────────
// `findById` resolves to a stub brand by default so create/update pass the
// existence check; tests override it to null to simulate an unknown brand.
const brandRepositoryMock = {
  findById: jest.fn((id: string) => Promise.resolve({ id, name: 'Spigen', slug: `slug-of-${id}` })),
  // Backs the real CatalogueFilterResolver (TASK-420), same echo convention as
  // the category mock above.
  findBySlug: jest.fn((slug: string) =>
    Promise.resolve({ id: `id-of-${slug}`, name: 'Spigen', slug }),
  ),
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
  // Backs the real CatalogueFilterResolver (TASK-420), same echo convention as
  // the category mock above.
  findModelById: jest.fn((id: string) => Promise.resolve({ id, slug: `slug-of-${id}` })),
  findModelBySlug: jest.fn((slug: string) => Promise.resolve({ id: `id-of-${slug}`, slug })),
};

// ─── ProductSpecRepository / AttributeDefinitionRepository mocks (TASK-191) ────
const specRepositoryMock = {
  getSpecs: jest.fn().mockResolvedValue([]),
  setSpecs: jest.fn().mockResolvedValue(undefined),
};

const attributeDefinitionRepositoryMock = {
  findEffectiveForCategory: jest.fn().mockResolvedValue([]),
  // TASK-487: resolves (creating if needed) the colour definition a bulk colour
  // edit files its value against, and widens that SELECT own option list.
  ensureColorDefinitionForCategory: jest.fn().mockResolvedValue({ id: 'def-color' }),
  addOptions: jest.fn().mockResolvedValue(undefined),
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
    categoryRepositoryMock.findById.mockImplementation((id: string) =>
      Promise.resolve({ id, slug: `slug-of-${id}` }),
    );
    categoryRepositoryMock.findBySlug.mockImplementation((slug: string) =>
      Promise.resolve({ id: `id-of-${slug}`, slug }),
    );
    brandRepositoryMock.findById.mockImplementation((id: string) =>
      Promise.resolve({ id, name: 'Spigen', slug: `slug-of-${id}` }),
    );
    brandRepositoryMock.findBySlug.mockImplementation((slug: string) =>
      Promise.resolve({ id: `id-of-${slug}`, name: 'Spigen', slug }),
    );
    deviceRepositoryMock.findModelById.mockImplementation((id: string) =>
      Promise.resolve({ id, slug: `slug-of-${id}` }),
    );
    deviceRepositoryMock.findModelBySlug.mockImplementation((slug: string) =>
      Promise.resolve({ id: `id-of-${slug}`, slug }),
    );
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
        // The REAL resolver (TASK-420), wired to the repository mocks above —
        // slug → id is part of what `findAll` promises, so stubbing it out would
        // leave the promise untested.
        CatalogueFilterResolver,
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

    // TASK-414: the two new storefront filters must survive the DTO → repository
    // mapping — `inStock` as a plain flag, `specs` parsed into facets.
    it('passes inStock and the parsed spec facets through to the repository', async () => {
      productRepositoryMock.findAll.mockResolvedValue({ products: [], total: 0 });

      await service.findAll({
        page: 1,
        limit: 20,
        inStock: true,
        specs: 'material:Силікон,TPU;case-type:Накладка',
      });

      expect(productRepositoryMock.findAll).toHaveBeenCalledWith(
        expect.objectContaining({
          inStock: true,
          specFilters: [
            { key: 'material', values: ['Силікон', 'TPU'] },
            { key: 'case-type', values: ['Накладка'] },
          ],
        }),
      );
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

    // ─── TASK-420: slug-shaped catalogue filters ─────────────────────────────

    it('resolves ?category/?brand/?device slugs to ids before touching the repository', async () => {
      productRepositoryMock.findAll.mockResolvedValue({ products: [], total: 0 });
      categoryRepositoryMock.findBySlug.mockResolvedValue({
        id: 'cat-uuid-7',
        slug: 'phone-cases',
      });
      brandRepositoryMock.findBySlug.mockResolvedValue({
        id: 'brand-uuid-7',
        name: 'Apple',
        slug: 'apple',
      });
      deviceRepositoryMock.findModelBySlug.mockResolvedValue({
        id: 'model-uuid-7',
        slug: 'iphone-15',
      });

      await service.findAll({
        page: 1,
        limit: 20,
        category: 'phone-cases',
        brand: 'apple',
        device: 'iphone-15',
      });

      // A deactivated category must still be filterable — visibility is enforced
      // by `categoryActiveOnly` downstream, not by hiding the id from the filter.
      expect(categoryRepositoryMock.findBySlug).toHaveBeenCalledWith('phone-cases', {
        activeOnly: false,
      });
      expect(categoryRepositoryMock.findSubtreeIds).toHaveBeenCalledWith('cat-uuid-7');
      expect(productRepositoryMock.findAll).toHaveBeenCalledWith(
        expect.objectContaining({
          categoryIds: ['cat-uuid-7'],
          brandId: 'brand-uuid-7',
          deviceModelId: 'model-uuid-7',
        }),
      );
    });

    // The behaviour an unknown-but-well-formed `?categoryId=` has always had,
    // extended to slugs: the filter is APPLIED and matches nothing. Never a 400
    // (a dead link is not a client error), and never a silently WIDER listing —
    // `/products?brand=typo` must not quietly render the whole catalogue.
    it('applies an unknown slug as a filter that matches nothing, not as no filter', async () => {
      productRepositoryMock.findAll.mockResolvedValue({ products: [], total: 0 });
      brandRepositoryMock.findBySlug.mockResolvedValue(null);
      categoryRepositoryMock.findBySlug.mockResolvedValue(null);

      const result = await service.findAll({
        page: 1,
        limit: 20,
        category: 'no-such-category',
        brand: 'no-such-brand',
      });

      expect(productRepositoryMock.findAll).toHaveBeenCalledWith(
        expect.objectContaining({
          brandId: UNRESOLVED_FILTER_ID,
          categoryIds: [UNRESOLVED_FILTER_ID],
        }),
      );
      expect(result.data).toEqual([]);
    });

    it('lets the slug win when a request carries both spellings of one axis', async () => {
      productRepositoryMock.findAll.mockResolvedValue({ products: [], total: 0 });
      brandRepositoryMock.findBySlug.mockResolvedValue({
        id: 'from-slug',
        name: 'Apple',
        slug: 'apple',
      });

      await service.findAll({ page: 1, limit: 20, brand: 'apple', brandId: 'from-uuid' });

      expect(productRepositoryMock.findAll).toHaveBeenCalledWith(
        expect.objectContaining({ brandId: 'from-slug' }),
      );
      expect(brandRepositoryMock.findById).not.toHaveBeenCalled();
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

      // Counted per PREFIX, not per call: one invalidation round now purges the
      // product-list namespace AND the derived per-category brand list
      // (TASK-414). The invariant under test is "once per BATCH, not once per
      // product", which is about the product-list prefix.
      expect(
        cacheServiceMock.delByPrefix.mock.calls.filter(
          ([prefix]: [string]) => prefix === PRODUCT_LIST_PREFIX,
        ),
      ).toHaveLength(1);
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

  // ─── setGroupMany (admin, TASK-423) ──────────────────────────────────────────

  describe('setGroupMany', () => {
    const moved = [
      { id: 'product-uuid-1', slug: 'iphone-15-pro-case', isActive: true, groupId: 'group-1' },
      { id: 'product-uuid-2', slug: 'galaxy-s24-case', isActive: true, groupId: 'group-1' },
    ];

    it('evicts each moved product by BOTH id and slug, and re-indexes it', async () => {
      productRepositoryMock.setGroupMany.mockResolvedValue({ updated: moved, siblings: [] });

      const count = await service.setGroupMany(['product-uuid-1', 'product-uuid-2'], 'group-1');

      expect(count).toBe(2);
      expect(productRepositoryMock.setGroupMany).toHaveBeenCalledWith(
        ['product-uuid-1', 'product-uuid-2'],
        'group-1',
      );
      expect(cacheServiceMock.del).toHaveBeenCalledWith(expect.stringContaining('product-uuid-1'));
      expect(cacheServiceMock.del).toHaveBeenCalledWith(
        expect.stringContaining('iphone-15-pro-case'),
      );
      expect(productIndexerMock.index).toHaveBeenCalledWith('product-uuid-1');
      expect(productIndexerMock.index).toHaveBeenCalledWith('product-uuid-2');
    });

    /**
     * The assertion that makes the feature real. A cached product detail carries
     * its `variantSiblings`, so a regrouping changes what the UNTOUCHED members of
     * the old and new groups should say. Skip this and the storefront keeps
     * offering a variant that left the family and omits the one that joined —
     * which the operator reads as "the bulk action did nothing".
     */
    it('also evicts the untouched siblings of the source and destination groups', async () => {
      productRepositoryMock.setGroupMany.mockResolvedValue({
        updated: moved,
        siblings: [{ id: 'sibling-uuid', slug: 'iphone-15-pro-case-blue' }],
      });

      await service.setGroupMany(['product-uuid-1', 'product-uuid-2'], 'group-1');

      expect(cacheServiceMock.del).toHaveBeenCalledWith(expect.stringContaining('sibling-uuid'));
      expect(cacheServiceMock.del).toHaveBeenCalledWith(
        expect.stringContaining('iphone-15-pro-case-blue'),
      );
      // A sibling was not WRITTEN, only invalidated — re-indexing it would be a
      // search write nothing asked for.
      expect(productIndexerMock.index).not.toHaveBeenCalledWith('sibling-uuid');
    });

    it('removes an inactive moved product from the index rather than indexing it', async () => {
      // The visibility travels with the row precisely so this path cannot guess:
      // indexing a hidden product is how it reappears in storefront search.
      productRepositoryMock.setGroupMany.mockResolvedValue({
        updated: [{ ...moved[0], isActive: false }],
        siblings: [],
      });

      await service.setGroupMany(['product-uuid-1'], 'group-1');

      expect(productIndexerMock.remove).toHaveBeenCalledWith('product-uuid-1');
      expect(productIndexerMock.index).not.toHaveBeenCalled();
    });

    it('ungroups on a null target', async () => {
      productRepositoryMock.setGroupMany.mockResolvedValue({
        updated: [{ ...moved[0], groupId: null }],
        siblings: [],
      });

      await service.setGroupMany(['product-uuid-1'], null);

      expect(productRepositoryMock.setGroupMany).toHaveBeenCalledWith(['product-uuid-1'], null);
    });

    it('evicts the list prefix once, not once per product', async () => {
      productRepositoryMock.setGroupMany.mockResolvedValue({ updated: moved, siblings: [] });

      await service.setGroupMany(['product-uuid-1', 'product-uuid-2'], 'group-1');

      // Counted PER PREFIX, not in total. `invalidateProductLists` also purges the
      // derived per-category brand list (TASK-414, landed on develop in a parallel
      // wave), so a bare `toHaveBeenCalledTimes(1)` measured how many prefixes that
      // helper happens to purge — not the thing this test is about, which is that
      // TWO moved products still cause ONE list eviction rather than one each.
      const listEvictions = cacheServiceMock.delByPrefix.mock.calls.filter(
        ([prefix]: [string]) => prefix === PRODUCT_LIST_PREFIX,
      );
      expect(listEvictions).toHaveLength(1);
    });

    it('maps an unknown product id to 404 and touches no cache', async () => {
      productRepositoryMock.setGroupMany.mockRejectedValue(
        new ProductsNotFoundError(['missing-uuid']),
      );

      await expect(
        service.setGroupMany(['product-uuid-1', 'missing-uuid'], 'group-1'),
      ).rejects.toThrow(NotFoundException);

      expect(cacheServiceMock.delByPrefix).not.toHaveBeenCalled();
      expect(productIndexerMock.index).not.toHaveBeenCalled();
    });

    it('maps an unknown destination group to 404 as well', async () => {
      // Otherwise it surfaces as a Prisma foreign-key error — a 500 for what is
      // plainly a bad request.
      productRepositoryMock.setGroupMany.mockRejectedValue(
        new ProductGroupNotFoundError('missing-group'),
      );

      await expect(service.setGroupMany(['product-uuid-1'], 'missing-group')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('lets an unexpected repository failure through untouched', async () => {
      const boom = new Error('connection reset');
      productRepositoryMock.setGroupMany.mockRejectedValue(boom);

      await expect(service.setGroupMany(['product-uuid-1'], 'group-1')).rejects.toThrow(boom);
    });
  });

  // ─── setColorMany (admin, TASK-487) ──────────────────────────────────────────

  describe('setColorMany', () => {
    const recoloured = [
      { id: 'product-uuid-1', slug: 'iphone-15-pro-case-black', isActive: true },
      { id: 'product-uuid-2', slug: 'iphone-15-pro-case-white', isActive: true },
    ];

    beforeEach(() => {
      productRepositoryMock.findCategoriesForBulk.mockResolvedValue([
        { id: 'product-uuid-1', categoryId: 'cat-cases', groupId: 'group-1' },
        { id: 'product-uuid-2', categoryId: 'cat-cases', groupId: 'group-1' },
      ]);
      productRepositoryMock.setColorMany.mockResolvedValue({
        updated: recoloured,
        siblings: [],
      });
    });

    it('resolves a colour definition per product and hands it to the write', async () => {
      const count = await service.setColorMany(['product-uuid-1', 'product-uuid-2'], 'Чорний');

      expect(count).toBe(2);
      expect(productRepositoryMock.setColorMany).toHaveBeenCalledWith(
        ['product-uuid-1', 'product-uuid-2'],
        'Чорний',
        new Map([
          ['product-uuid-1', 'def-color'],
          ['product-uuid-2', 'def-color'],
        ]),
      );
    });

    it('resolves ONE definition per distinct category, not one per product', async () => {
      // A colour family is N products in one category; walking the ancestor
      // chain N times would be N recursive CTEs for one answer.
      await service.setColorMany(['product-uuid-1', 'product-uuid-2'], 'Чорний');

      expect(
        attributeDefinitionRepositoryMock.ensureColorDefinitionForCategory,
      ).toHaveBeenCalledTimes(1);
      expect(
        attributeDefinitionRepositoryMock.ensureColorDefinitionForCategory,
      ).toHaveBeenCalledWith('cat-cases');
    });

    it('widens the SELECT option list to cover the colour it just wrote', async () => {
      // The admin spec editor renders a SELECT as a CLOSED dropdown: a colour
      // stored but not listed is one the panel cannot re-pick.
      await service.setColorMany(['product-uuid-1'], 'Синій титан');

      expect(attributeDefinitionRepositoryMock.addOptions).toHaveBeenCalledWith('def-color', [
        'Синій титан',
      ]);
    });

    it('evicts each recoloured product by BOTH id and slug, and re-indexes it', async () => {
      await service.setColorMany(['product-uuid-1', 'product-uuid-2'], 'Чорний');

      expect(cacheServiceMock.del).toHaveBeenCalledWith(expect.stringContaining('product-uuid-1'));
      expect(cacheServiceMock.del).toHaveBeenCalledWith(
        expect.stringContaining('iphone-15-pro-case-black'),
      );
      expect(productIndexerMock.index).toHaveBeenCalledWith('product-uuid-1');
      expect(productIndexerMock.index).toHaveBeenCalledWith('product-uuid-2');
    });

    /**
     * A cached product detail carries its `variantSiblings` AND their
     * attributes, so recolouring one position changes what the untouched
     * members of its group should say — the PDP would keep offering the old
     * swatch until the TTL expired.
     */
    it('also evicts the untouched siblings of the affected groups', async () => {
      productRepositoryMock.setColorMany.mockResolvedValue({
        updated: recoloured,
        siblings: [{ id: 'sibling-uuid', slug: 'iphone-15-pro-case-blue' }],
      });

      await service.setColorMany(['product-uuid-1'], 'Чорний');

      expect(cacheServiceMock.del).toHaveBeenCalledWith(expect.stringContaining('sibling-uuid'));
      expect(productIndexerMock.index).not.toHaveBeenCalledWith('sibling-uuid');
    });

    it('evicts the list prefix once, not once per product', async () => {
      await service.setColorMany(['product-uuid-1', 'product-uuid-2'], 'Чорний');

      const listEvictions = cacheServiceMock.delByPrefix.mock.calls.filter(
        ([prefix]: [string]) => prefix === PRODUCT_LIST_PREFIX,
      );
      expect(listEvictions).toHaveLength(1);
    });

    it('removes an inactive recoloured product from the index rather than indexing it', async () => {
      productRepositoryMock.setColorMany.mockResolvedValue({
        updated: [{ ...recoloured[0], isActive: false }],
        siblings: [],
      });

      await service.setColorMany(['product-uuid-1'], 'Чорний');

      expect(productIndexerMock.remove).toHaveBeenCalledWith('product-uuid-1');
      expect(productIndexerMock.index).not.toHaveBeenCalled();
    });

    describe('clearing (color: null)', () => {
      it('resolves no definition and creates none', async () => {
        // Creating a colour definition for a category on the way to REMOVING a
        // colour would be a facet conjured out of a deletion.
        await service.setColorMany(['product-uuid-1'], null);

        expect(
          attributeDefinitionRepositoryMock.ensureColorDefinitionForCategory,
        ).not.toHaveBeenCalled();
        expect(attributeDefinitionRepositoryMock.addOptions).not.toHaveBeenCalled();
        expect(productRepositoryMock.setColorMany).toHaveBeenCalledWith(
          ['product-uuid-1'],
          null,
          new Map(),
        );
      });
    });

    it('maps an unknown product id to 404 and writes nothing', async () => {
      productRepositoryMock.findCategoriesForBulk.mockRejectedValue(
        new ProductsNotFoundError(['missing-uuid']),
      );

      await expect(service.setColorMany(['missing-uuid'], 'Чорний')).rejects.toThrow(
        NotFoundException,
      );

      expect(productRepositoryMock.setColorMany).not.toHaveBeenCalled();
      expect(
        attributeDefinitionRepositoryMock.ensureColorDefinitionForCategory,
      ).not.toHaveBeenCalled();
      expect(cacheServiceMock.delByPrefix).not.toHaveBeenCalled();
    });

    it('maps a product that vanished between the read and the write to 404', async () => {
      productRepositoryMock.setColorMany.mockRejectedValue(
        new ProductsNotFoundError(['product-uuid-2']),
      );

      await expect(
        service.setColorMany(['product-uuid-1', 'product-uuid-2'], 'Чорний'),
      ).rejects.toThrow(NotFoundException);

      expect(cacheServiceMock.delByPrefix).not.toHaveBeenCalled();
    });

    it('lets an unexpected repository failure through untouched', async () => {
      const boom = new Error('connection reset');
      productRepositoryMock.setColorMany.mockRejectedValue(boom);

      await expect(service.setColorMany(['product-uuid-1'], 'Чорний')).rejects.toThrow(boom);
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
        // TASK-420: the taxonomy axes are keyed by SLUG now, absent here.
        category: undefined,
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

    // TASK-414. A filter that is applied but ABSENT from the cache key is the
    // worst failure mode this layer has: the filtered page is served from — and
    // written into — the UNFILTERED page's entry, so a shopper who ticks
    // "В наявності" poisons the catalogue for everyone. That is exactly why
    // `outOfStock` is forced off on the public path (see the comment in
    // `ProductService.findAll`); `inStock` is public and cannot be, so it MUST
    // be keyed.
    it('keys inStock into the cache key (an unkeyed filter would poison the list cache)', async () => {
      cacheServiceMock.get.mockResolvedValue(null);
      productRepositoryMock.findAll.mockResolvedValue({ products: [], total: 0 });

      await service.findAll({ page: 1, limit: 20, inStock: true });
      const filteredKey = cacheServiceMock.get.mock.calls.at(-1)![0] as string;

      cacheServiceMock.get.mockClear();
      await service.findAll({ page: 1, limit: 20 });
      const unfilteredKey = cacheServiceMock.get.mock.calls.at(-1)![0] as string;

      expect(filteredKey).toContain('inStock=true');
      expect(filteredKey).not.toBe(unfilteredKey);
    });

    // ─── TASK-420: slug filters, keyed on ONE canonical form ─────────────────

    it('keys the taxonomy filters by SLUG, not by the id it resolved to', async () => {
      cacheServiceMock.get.mockResolvedValue(null);
      productRepositoryMock.findAll.mockResolvedValue({ products: [], total: 0 });

      await service.findAll({
        page: 1,
        limit: 20,
        category: 'phone-cases',
        brand: 'apple',
        device: 'iphone-15',
      });
      const key = cacheServiceMock.get.mock.calls.at(-1)![0] as string;

      expect(key).toContain('category=phone-cases');
      expect(key).toContain('brand=apple');
      expect(key).toContain('device=iphone-15');
      // The resolved ids (`id-of-<slug>` from the echo mocks) must NOT leak in.
      expect(key).not.toContain('id-of-');
    });

    // The whole point of "one canonical form": `?brand=apple` and the legacy
    // `?brandId=<apple's uuid>` are the same listing. Two keys would mean two
    // entries, each hit half as often — the TASK-541 class of bug, which is in
    // the BACKLOG precisely because it is invisible from the outside.
    it('maps the slug and the legacy uuid spelling of one filter onto ONE key', async () => {
      cacheServiceMock.get.mockResolvedValue(null);
      productRepositoryMock.findAll.mockResolvedValue({ products: [], total: 0 });
      // One brand, addressed both ways: id `brand-uuid-9`, slug `slug-of-brand-uuid-9`.
      brandRepositoryMock.findBySlug.mockResolvedValue({
        id: 'brand-uuid-9',
        name: 'Apple',
        slug: 'slug-of-brand-uuid-9',
      });

      await service.findAll({ page: 1, limit: 20, brandId: 'brand-uuid-9' });
      const byId = cacheServiceMock.get.mock.calls.at(-1)![0] as string;

      cacheServiceMock.get.mockClear();
      await service.findAll({ page: 1, limit: 20, brand: 'slug-of-brand-uuid-9' });
      const bySlug = cacheServiceMock.get.mock.calls.at(-1)![0] as string;

      expect(bySlug).toBe(byId);
      // …and both filter by the same id, so the shared entry is truthful.
      expect(productRepositoryMock.findAll).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({ brandId: 'brand-uuid-9' }),
      );
    });

    it('collapses every unknown slug onto one key, distinct from the unfiltered list', async () => {
      cacheServiceMock.get.mockResolvedValue(null);
      productRepositoryMock.findAll.mockResolvedValue({ products: [], total: 0 });
      brandRepositoryMock.findBySlug.mockResolvedValue(null);

      await service.findAll({ page: 1, limit: 20, brand: 'no-such-brand' });
      const firstMiss = cacheServiceMock.get.mock.calls.at(-1)![0] as string;

      cacheServiceMock.get.mockClear();
      await service.findAll({ page: 1, limit: 20, brand: 'also-no-such-brand' });
      const secondMiss = cacheServiceMock.get.mock.calls.at(-1)![0] as string;

      cacheServiceMock.get.mockClear();
      await service.findAll({ page: 1, limit: 20 });
      const unfiltered = cacheServiceMock.get.mock.calls.at(-1)![0] as string;

      expect(secondMiss).toBe(firstMiss);
      expect(firstMiss).toContain(`brand=${UNRESOLVED_FILTER_KEY}`);
      expect(firstMiss).not.toBe(unfiltered);
    });

    it('keys the spec facets into the cache key', async () => {
      cacheServiceMock.get.mockResolvedValue(null);
      productRepositoryMock.findAll.mockResolvedValue({ products: [], total: 0 });

      await service.findAll({ page: 1, limit: 20, specs: 'material:Силікон' });
      const key = cacheServiceMock.get.mock.calls.at(-1)![0] as string;

      expect(key).toContain('specs=material:Силікон');
    });

    // The checkbox tick ORDER must not decide which cache entry a shopper lands
    // on: `?specs=material:Силікон,TPU` and `?specs=material:TPU,Силікон` are
    // the same filter and the same result set, so they must be one entry.
    it('canonicalizes the specs param so equivalent orderings share one entry', async () => {
      cacheServiceMock.get.mockResolvedValue(null);
      productRepositoryMock.findAll.mockResolvedValue({ products: [], total: 0 });

      await service.findAll({ page: 1, limit: 20, specs: 'material:Силікон,TPU;form:Накладка' });
      const first = cacheServiceMock.get.mock.calls.at(-1)![0] as string;

      cacheServiceMock.get.mockClear();
      await service.findAll({ page: 1, limit: 20, specs: 'form:Накладка;material:TPU,Силікон' });
      const second = cacheServiceMock.get.mock.calls.at(-1)![0] as string;

      expect(second).toBe(first);
    });

    // A malformed facet is dropped before the query runs, so it must also be
    // dropped from the key — otherwise the same result set fragments across two
    // entries and the junk-param request never gets a hit.
    it('drops an unparseable specs param from the key instead of fragmenting it', async () => {
      cacheServiceMock.get.mockResolvedValue(null);
      productRepositoryMock.findAll.mockResolvedValue({ products: [], total: 0 });

      await service.findAll({ page: 1, limit: 20, specs: 'not-a-pair' });
      const junkKey = cacheServiceMock.get.mock.calls.at(-1)![0] as string;

      cacheServiceMock.get.mockClear();
      await service.findAll({ page: 1, limit: 20 });
      const plainKey = cacheServiceMock.get.mock.calls.at(-1)![0] as string;

      expect(junkKey).toBe(plainKey);
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
      const cached = ProductEntity.fromPrisma({ ...mockProduct, reservedQty: 0 });
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

      // One product-list purge ⇔ one storefront purge. Counted on the
      // product-list prefix specifically, since an invalidation round also
      // purges the derived brand-list namespace (TASK-414) and that half has no
      // storefront counterpart.
      expect(revalidationMock.revalidate).toHaveBeenCalledTimes(
        cacheServiceMock.delByPrefix.mock.calls.filter(
          ([prefix]: [string]) => prefix === PRODUCT_LIST_PREFIX,
        ).length,
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

  // ─── mutation echoes carry the REAL reserved/physical pair (TASK-408) ────────

  /**
   * Every admin mutation echoes the written row back as a ProductEntity, and the
   * admin form reads `physicalQty` off that echo as «фізично на складі». All
   * seven paths used to omit `reservedQty`, so the entity defaulted it to 0 and
   * every save reported physical == free — the one moment the operator is
   * actually looking at the number.
   *
   * The table is the point: the defect was not one forgotten call site but the
   * SAME omission repeated seven times, so the guard has to enumerate all seven.
   */
  describe('reserved/physical on mutation echoes (TASK-408)', () => {
    const RESERVED = 4;
    const createInput: CreateProductInput = {
      name: 'iPhone 15 Pro Case — Clear MagSafe',
      slug: 'iphone-15-pro-case-clear-magsafe',
      price: 29.99,
      categoryId: 'category-uuid-1',
    };

    const echoes: Array<{ name: string; run: () => Promise<ProductEntity> }> = [
      {
        name: 'create',
        run: () => {
          productRepositoryMock.findBySlug.mockResolvedValue(null);
          productRepositoryMock.findBySku.mockResolvedValue(null);
          productRepositoryMock.create.mockResolvedValue(mockProduct);
          return service.create(createInput);
        },
      },
      {
        name: 'update',
        run: () => {
          productRepositoryMock.findById.mockResolvedValue(mockProduct);
          productRepositoryMock.update.mockResolvedValue(mockProduct);
          return service.update('product-uuid-1', { name: 'Renamed' });
        },
      },
      {
        name: 'deactivate',
        run: () => {
          productRepositoryMock.findById.mockResolvedValue(mockProduct);
          productRepositoryMock.deactivate.mockResolvedValue({
            ...mockProduct,
            isActive: false,
          });
          return service.deactivate('product-uuid-1');
        },
      },
      {
        name: 'activate',
        run: () => {
          productRepositoryMock.findById.mockResolvedValue(mockInactiveProduct);
          productRepositoryMock.activate.mockResolvedValue({
            ...mockInactiveProduct,
            id: 'product-uuid-1',
            isActive: true,
          });
          return service.activate('product-uuid-1');
        },
      },
      {
        name: 'delete',
        run: () => {
          productRepositoryMock.findById.mockResolvedValue(mockProduct);
          productRepositoryMock.softDelete.mockResolvedValue({
            ...mockProduct,
            isActive: false,
          });
          return service.delete('product-uuid-1');
        },
      },
      {
        name: 'updateDeviceCompat',
        run: () => {
          productRepositoryMock.findById.mockResolvedValue(mockProduct);
          deviceRepositoryMock.findModelsByIds.mockResolvedValue([]);
          return service.updateDeviceCompat('product-uuid-1', []);
        },
      },
      {
        name: 'updateSpecs',
        run: () => {
          productRepositoryMock.findById.mockResolvedValue(mockProduct);
          attributeDefinitionRepositoryMock.findEffectiveForCategory.mockResolvedValue([]);
          return service.updateSpecs('product-uuid-1', []);
        },
      },
    ];

    it.each(echoes)('$name echoes physicalQty = stock + reservedQty', async ({ run }) => {
      productRepositoryMock.getReservedQtyByProductId.mockResolvedValue(
        new Map([['product-uuid-1', RESERVED]]),
      );

      const result = await run();

      expect(productRepositoryMock.getReservedQtyByProductId).toHaveBeenCalledWith([
        'product-uuid-1',
      ]);
      expect(result.reservedQty).toBe(RESERVED);
      expect(result.stock).toBe(mockProduct.stock);
      expect(result.physicalQty).toBe(mockProduct.stock + RESERVED);
    });

    it.each(echoes)(
      '$name still reports physical == free when nothing is reserved',
      async ({ run }) => {
        productRepositoryMock.getReservedQtyByProductId.mockResolvedValue(
          new Map<string, number>(),
        );

        const result = await run();

        expect(result.reservedQty).toBe(0);
        expect(result.physicalQty).toBe(mockProduct.stock);
      },
    );
  });
});
