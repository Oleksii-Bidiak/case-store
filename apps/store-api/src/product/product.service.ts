import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  ProductRepository,
  CreateProductInput,
  UpdateProductInput,
  FindAllParams,
} from './product.repository';
import {
  ProductEntity,
  PublicProductEntity,
  ProductGroupEntity,
  ProductImageEntity,
  ProductCategoryEntity,
} from './entities';
import { ProductListQueryDto } from './dto';
import { generateSlug } from '../common/utils';
import {
  CacheService,
  buildProductListKey,
  productDetailIdKey,
  productDetailSlugKey,
  PRODUCT_LIST_PREFIX,
} from '../cache';

/** Fallback TTL (seconds) when REDIS_CACHE_TTL_SECONDS is not configured. */
const DEFAULT_CACHE_TTL_SECONDS = 300;

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
  data: PublicProductEntity[];
  meta: PaginationMeta;
}

/**
 * Product detail response with category, group (siblings + axes), and images.
 */
interface ProductDetailResponse {
  data: PublicProductEntity;
  category: ProductCategoryEntity;
  group: ProductGroupEntity | null;
  images: ProductImageEntity[];
}

/**
 * Cache invalidation obligation: ANY method that mutates product data MUST
 * evict the affected cache entries after the write, otherwise stale data is
 * served until the TTL expires. Use {@link ProductService.evictProductDetail}
 * for detail keys and `delByPrefix(PRODUCT_LIST_PREFIX)` for list pages.
 */
@Injectable()
export class ProductService {
  private readonly cacheTtlSeconds: number;

  constructor(
    private readonly productRepository: ProductRepository,
    private readonly cache: CacheService,
    private readonly config: ConfigService,
  ) {
    this.cacheTtlSeconds =
      this.config.get<number>('REDIS_CACHE_TTL_SECONDS') ?? DEFAULT_CACHE_TTL_SECONDS;
  }

  /**
   * Get a paginated list of products with optional filtering.
   * Public endpoint — defaults to showing only active products.
   * Cache-aside: a cache hit skips the database entirely.
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

    const cacheKey = buildProductListKey(params);
    const cached = await this.cache.get<PaginatedProductsResponse>(cacheKey);
    if (cached) {
      return cached;
    }

    const { products, total } = await this.productRepository.findAll(params);
    const totalPages = Math.ceil(total / params.limit);

    const response: PaginatedProductsResponse = {
      data: products.map((product) => PublicProductEntity.fromPrisma(product)),
      meta: {
        total,
        page: params.page,
        limit: params.limit,
        totalPages,
      },
    };

    // NOTE: as of the line-item contract change, cached list entries hold
    // `PublicProductEntity` items (no raw `stock`, with `inStock`/`lowStock`).
    // Any Redis warm-up entries written before this deploy carry the old shape
    // and must be evicted on rollout — the cache TTL otherwise self-heals.
    await this.cache.set(cacheKey, response, this.cacheTtlSeconds);
    return response;
  }

  /**
   * Get a product by slug with its category, variants, and images.
   * Public endpoint — used for product detail pages.
   * Cache-aside; throws NotFoundException if the product is not found.
   *
   * Uses the repository's default `activeOnly: true` filter, so a deactivated
   * product is indistinguishable from a missing slug and returns 404 (TASK-145).
   */
  async findBySlug(slug: string): Promise<ProductDetailResponse> {
    const cacheKey = productDetailSlugKey(slug);
    const cached = await this.cache.get<ProductDetailResponse>(cacheKey);
    if (cached) {
      return cached;
    }

    const product = await this.productRepository.findBySlugWithRelations(slug);

    if (!product) {
      throw new NotFoundException('Product not found');
    }

    const response: ProductDetailResponse = {
      data: PublicProductEntity.fromPrisma(product),
      category: ProductCategoryEntity.fromPrisma(product.category),
      group: product.group ? ProductGroupEntity.fromPrisma(product.group) : null,
      images: product.images.map((img) => ProductImageEntity.fromPrisma(img)),
    };

    await this.cache.set(cacheKey, response, this.cacheTtlSeconds);
    return response;
  }

  /**
   * Get a product by ID (admin-only).
   * Cache-aside; throws NotFoundException if the product is not found.
   */
  async findById(id: string): Promise<ProductEntity> {
    const cacheKey = productDetailIdKey(id);
    const cached = await this.cache.get<ProductEntity>(cacheKey);
    if (cached) {
      return cached;
    }

    const product = await this.productRepository.findById(id);

    if (!product) {
      throw new NotFoundException('Product not found');
    }

    const entity = ProductEntity.fromPrisma(product);
    await this.cache.set(cacheKey, entity, this.cacheTtlSeconds);
    return entity;
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

    // A new product may appear on any list page — bust every list cache entry.
    await this.cache.delByPrefix(PRODUCT_LIST_PREFIX);

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

    // Evict list pages and both detail variants. The slug may have changed, so
    // evict the OLD slug captured above; if it changed, also evict the new one.
    await this.cache.delByPrefix(PRODUCT_LIST_PREFIX);
    await this.evictProductDetail(id, product.slug);
    if (input.slug !== undefined && input.slug !== product.slug) {
      await this.cache.del(productDetailSlugKey(input.slug));
    }

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

    await this.cache.delByPrefix(PRODUCT_LIST_PREFIX);
    await this.evictProductDetail(id, product.slug);

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

    await this.cache.delByPrefix(PRODUCT_LIST_PREFIX);
    await this.evictProductDetail(id, product.slug);

    return ProductEntity.fromPrisma(activatedProduct);
  }

  /**
   * Soft-delete a product (admin-only, TASK-104). Stamps `deletedAt`, sets
   * `isActive = false`, and mangles the unique `slug`/`sku` (prefixing
   * `deleted:<id>:`) so those slots are freed for new products. The row is kept
   * so historical order items still resolve the product name.
   *
   * Throws NotFoundException if the product does not exist (or is already
   * soft-deleted — `findById` excludes tombstoned rows).
   */
  async delete(id: string): Promise<ProductEntity> {
    const product = await this.productRepository.findById(id);

    if (!product) {
      throw new NotFoundException('Product not found');
    }

    const mangledSlug = `deleted:${product.id}:${product.slug}`;
    const mangledSku = product.sku ? `deleted:${product.id}:${product.sku}` : null;

    const deleted = await this.productRepository.softDelete(id, mangledSlug, mangledSku);

    // A removed product must disappear from every list page and its detail caches.
    await this.cache.delByPrefix(PRODUCT_LIST_PREFIX);
    await this.evictProductDetail(id, product.slug);

    return ProductEntity.fromPrisma(deleted);
  }

  /**
   * Evict both detail cache variants (by id and by slug) for a product. Cache
   * errors are swallowed inside CacheService, so this never affects the caller.
   */
  private async evictProductDetail(id: string, slug: string): Promise<void> {
    await this.cache.del(productDetailIdKey(id));
    await this.cache.del(productDetailSlugKey(slug));
  }
}
