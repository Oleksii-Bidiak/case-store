import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, ConflictException } from '@nestjs/common';
import { ProductRepository, CreateProductInput, UpdateProductInput } from './product.repository';
import { ProductService } from './product.service';
import { ProductEntity } from './entities';
import { ProductListQueryDto } from './dto';

// ─── Mock data ────────────────────────────────────────────────────────────────

const mockProduct = {
  id: 'product-uuid-1',
  name: 'iPhone 15 Pro Case — Clear MagSafe',
  slug: 'iphone-15-pro-case-clear-magsafe',
  description: 'Premium clear case with MagSafe compatibility',
  price: { toString: () => '29.99' },
  compareAtPrice: { toString: () => '39.99' },
  sku: 'IP15-PRO-CASE-CLR',
  categoryId: 'category-uuid-1',
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
};

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('ProductService', () => {
  let service: ProductService;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [ProductService, { provide: ProductRepository, useValue: productRepositoryMock }],
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
      expect(result.data[0]).toBeInstanceOf(ProductEntity);
      expect(result.meta.total).toBe(1);
      expect(result.meta.page).toBe(1);
      expect(result.meta.limit).toBe(20);
      expect(result.meta.totalPages).toBe(1);
      expect(productRepositoryMock.findAll).toHaveBeenCalledWith({
        page: 1,
        limit: 20,
        categoryId: undefined,
        isActive: undefined,
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
  });

  // ─── findBySlug (public) ─────────────────────────────────────────────────────

  describe('findBySlug', () => {
    it('should return product with relations when found', async () => {
      const productWithRelations = {
        ...mockProduct,
        category: { id: 'cat-1', name: 'Phone Cases', slug: 'phone-cases' },
        variants: [],
        images: [],
      };
      productRepositoryMock.findBySlugWithRelations.mockResolvedValue(productWithRelations);

      const result = await service.findBySlug('iphone-15-pro-case-clear-magsafe');

      expect(result).toHaveProperty('data');
      expect(result.data).toBeInstanceOf(ProductEntity);
      expect(result.data.slug).toBe('iphone-15-pro-case-clear-magsafe');
      expect(result).toHaveProperty('category');
      expect(result).toHaveProperty('variants');
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
});
