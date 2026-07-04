import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, ConflictException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ProductRepository, CreateProductInput, UpdateProductInput } from './product.repository';
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
  create: jest.fn(),
  update: jest.fn(),
  deactivate: jest.fn(),
  activate: jest.fn(),
  softDelete: jest.fn(),
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

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ProductService,
        { provide: ProductRepository, useValue: productRepositoryMock },
        { provide: CacheService, useValue: cacheServiceMock },
        { provide: ConfigService, useValue: configServiceMock },
        { provide: ProductIndexer, useValue: productIndexerMock },
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
        categoryId: undefined,
        // TASK-230: the public listing always forces the active-only filter.
        isActive: true,
        minPrice: undefined,
        maxPrice: undefined,
        search: undefined,
        sortBy: 'createdAt',
        sortOrder: 'desc',
      });
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
        categoryId: 'cat-uuid-1',
        isActive: true,
        minPrice: 10,
        maxPrice: 50,
        search: 'iphone',
        sortBy: 'price',
        sortOrder: 'asc',
      });
    });

    // TASK-230: the leak — a public caller asking for inactive products (or
    // sending no filter) must still get only active ones.
    it('overrides an explicit isActive=false from a public caller with true', async () => {
      productRepositoryMock.findAll.mockResolvedValue({ products: [], total: 0 });

      await service.findAll({ ...query, isActive: false });

      expect(productRepositoryMock.findAll).toHaveBeenCalledWith(
        expect.objectContaining({ isActive: true }),
      );
    });
  });

  // ─── adminFindAll (admin, TASK-230) ─────────────────────────────────────────

  describe('adminFindAll', () => {
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

    it('passes isActive=false through so the admin can list only deactivated products', async () => {
      productRepositoryMock.findAll.mockResolvedValue({ products: [], total: 0 });

      await service.adminFindAll({ page: 1, limit: 20, isActive: false });

      expect(productRepositoryMock.findAll).toHaveBeenCalledWith(
        expect.objectContaining({ isActive: false }),
      );
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
      expect(productRepositoryMock.create).toHaveBeenCalledWith(createInput);
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
      expect(productRepositoryMock.update).toHaveBeenCalledWith('product-uuid-1', updateInput);
    });

    it('should throw NotFoundException when product is not found', async () => {
      productRepositoryMock.findById.mockResolvedValue(null);

      await expect(service.update('nonexistent-id', updateInput)).rejects.toThrow(
        NotFoundException,
      );
      expect(productRepositoryMock.update).not.toHaveBeenCalled();
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
});
