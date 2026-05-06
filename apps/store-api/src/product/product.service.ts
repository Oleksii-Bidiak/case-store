import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import {
  ProductRepository,
  CreateProductInput,
  UpdateProductInput,
  FindAllParams,
} from './product.repository';
import {
  ProductEntity,
  ProductVariantEntity,
  ProductImageEntity,
  ProductCategoryEntity,
} from './entities';
import { ProductListQueryDto } from './dto';
import { generateSlug } from '../common/utils';

/**
 * Pagination metadata returned alongside paginated results.
 */
interface PaginationMeta {
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

/**
 * Paginated response envelope for product lists.
 */
interface PaginatedProductsResponse {
  data: ProductEntity[];
  meta: PaginationMeta;
}

/**
 * Product detail response with category, variants, and images.
 */
interface ProductDetailResponse {
  data: ProductEntity;
  category: ProductCategoryEntity;
  variants: ProductVariantEntity[];
  images: ProductImageEntity[];
}

@Injectable()
export class ProductService {
  constructor(private readonly productRepository: ProductRepository) {}

  /**
   * Get a paginated list of products with optional filtering.
   * Public endpoint — defaults to showing only active products.
   */
  async findAll(query: ProductListQueryDto): Promise<PaginatedProductsResponse> {
    const params: FindAllParams = {
      page: query.page ?? 1,
      limit: query.limit ?? 20,
      categoryId: query.categoryId,
      isActive: query.isActive,
      minPrice: query.minPrice,
      maxPrice: query.maxPrice,
      search: query.search,
      sortBy: query.sortBy ?? 'createdAt',
      sortOrder: query.sortOrder ?? 'desc',
    };

    const { products, total } = await this.productRepository.findAll(params);
    const totalPages = Math.ceil(total / params.limit);

    return {
      data: products.map((product) => ProductEntity.fromPrisma(product)),
      meta: {
        total,
        page: params.page,
        limit: params.limit,
        totalPages,
      },
    };
  }

  /**
   * Get a product by slug with its category, variants, and images.
   * Public endpoint — used for product detail pages.
   * Throws NotFoundException if the product is not found.
   */
  async findBySlug(slug: string): Promise<ProductDetailResponse> {
    const product = await this.productRepository.findBySlugWithRelations(slug);

    if (!product) {
      throw new NotFoundException('Product not found');
    }

    return {
      data: ProductEntity.fromPrisma(product),
      category: ProductCategoryEntity.fromPrisma(product.category),
      variants: product.variants.map((v) => ProductVariantEntity.fromPrisma(v)),
      images: product.images.map((img) => ProductImageEntity.fromPrisma(img)),
    };
  }

  /**
   * Get a product by ID (admin-only).
   * Throws NotFoundException if the product is not found.
   */
  async findById(id: string): Promise<ProductEntity> {
    const product = await this.productRepository.findById(id);

    if (!product) {
      throw new NotFoundException('Product not found');
    }

    return ProductEntity.fromPrisma(product);
  }

  /**
   * Create a new product (admin-only).
   * Validates slug and SKU uniqueness before creating.
   * Auto-generates slug from name if not provided.
   * Throws ConflictException if slug or SKU is already taken.
   */
  async create(input: CreateProductInput): Promise<ProductEntity> {
    // Auto-generate slug from name if not provided
    const slug = input.slug ?? generateSlug(input.name);

    // Check slug uniqueness
    const existingBySlug = await this.productRepository.findBySlug(slug);
    if (existingBySlug) {
      throw new ConflictException('A product with this slug already exists');
    }

    // Check SKU uniqueness (only if SKU is provided)
    if (input.sku) {
      const existingBySku = await this.productRepository.findBySku(input.sku);
      if (existingBySku) {
        throw new ConflictException('A product with this SKU already exists');
      }
    }

    const product = await this.productRepository.create({
      ...input,
      slug,
    });

    return ProductEntity.fromPrisma(product);
  }

  /**
   * Update a product (admin-only).
   * Validates slug and SKU uniqueness if they are being changed.
   * Throws NotFoundException if the product is not found.
   * Throws ConflictException if the new slug or SKU is already taken.
   */
  async update(id: string, input: UpdateProductInput): Promise<ProductEntity> {
    // Verify the product exists
    const product = await this.productRepository.findById(id);

    if (!product) {
      throw new NotFoundException('Product not found');
    }

    // If slug is being changed, check uniqueness
    if (input.slug !== undefined && input.slug !== product.slug) {
      const existingBySlug = await this.productRepository.findBySlug(input.slug);
      if (existingBySlug && existingBySlug.id !== id) {
        throw new ConflictException('A product with this slug already exists');
      }
    }

    // If SKU is being changed, check uniqueness (only for non-null values)
    if (input.sku !== undefined && input.sku !== null && input.sku !== product.sku) {
      const existingBySku = await this.productRepository.findBySku(input.sku);
      if (existingBySku && existingBySku.id !== id) {
        throw new ConflictException('A product with this SKU already exists');
      }
    }

    const updatedProduct = await this.productRepository.update(id, input);

    return ProductEntity.fromPrisma(updatedProduct);
  }

  /**
   * Deactivate a product by setting isActive = false (admin-only).
   * Throws NotFoundException if the product is not found.
   */
  async deactivate(id: string): Promise<ProductEntity> {
    const product = await this.productRepository.findById(id);

    if (!product) {
      throw new NotFoundException('Product not found');
    }

    const deactivatedProduct = await this.productRepository.deactivate(id);

    return ProductEntity.fromPrisma(deactivatedProduct);
  }

  /**
   * Activate a product by setting isActive = true (admin-only).
   * Throws NotFoundException if the product is not found.
   */
  async activate(id: string): Promise<ProductEntity> {
    const product = await this.productRepository.findById(id);

    if (!product) {
      throw new NotFoundException('Product not found');
    }

    const activatedProduct = await this.productRepository.activate(id);

    return ProductEntity.fromPrisma(activatedProduct);
  }
}
