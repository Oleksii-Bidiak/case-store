import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AttributeDefinition, AttributeType } from '@prisma/client';
import {
  ProductRepository,
  CreateProductInput,
  UpdateProductInput,
  FindAllParams,
} from './product.repository';
import { ProductDeviceCompatRepository } from './product-device-compat.repository';
import { ProductSpecRepository, SpecValueWrite } from './product-spec.repository';
import { CategoryRepository } from '../category';
import { BrandRepository } from '../brand';
import { DeviceRepository } from '../device';
import { AttributeDefinitionRepository } from '../attribute-definition';
import {
  ProductEntity,
  PublicProductEntity,
  ProductGroupEntity,
  ProductImageEntity,
  ProductCategoryEntity,
} from './entities';
import { ProductListQueryDto, parseSpecFilter } from './dto';
import { generateSlug } from '../common/utils';
import {
  CacheService,
  buildProductListKey,
  productDetailIdKey,
  productDetailSlugKey,
  PRODUCT_LIST_PREFIX,
} from '../cache';
import { ProductIndexer } from '../search/product-indexer';

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
 * Admin paginated list envelope (TASK-254). Unlike the public
 * {@link PaginatedProductsResponse}, items are full {@link ProductEntity}
 * objects carrying raw `stock`, `isActive`, and the derived
 * `reservedQty`/`physicalQty` — the public list deliberately never exposes these.
 */
interface AdminPaginatedProductsResponse {
  data: ProductEntity[];
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
 * Admin product detail response. Mirrors {@link ProductDetailResponse} but
 * carries the full {@link ProductEntity} (raw `stock`, `isActive`) instead of
 * the public-safe shape — used by the admin preview path (TASK-155).
 */
interface ProductDetailAdminResponse {
  data: ProductEntity;
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
    private readonly productIndexer: ProductIndexer,
    private readonly categoryRepository: CategoryRepository,
    private readonly brandRepository: BrandRepository,
    private readonly deviceCompatRepository: ProductDeviceCompatRepository,
    private readonly deviceRepository: DeviceRepository,
    private readonly specRepository: ProductSpecRepository,
    private readonly attributeDefinitionRepository: AttributeDefinitionRepository,
  ) {
    this.cacheTtlSeconds =
      this.config.get<number>('REDIS_CACHE_TTL_SECONDS') ?? DEFAULT_CACHE_TTL_SECONDS;
  }

  /**
   * Get a paginated list of products with optional filtering.
   * Public endpoint — ALWAYS restricted to active products (TASK-230): the
   * query's `isActive` is deliberately overridden, so deactivated positions
   * can never be listed publicly (the PDP already 404s them per TASK-145).
   * The admin table uses {@link adminFindAll} instead.
   * Cache-aside: a cache hit skips the database entirely.
   */
  async findAll(query: ProductListQueryDto): Promise<PaginatedProductsResponse> {
    const listParams = this.toListParams(query);

    // The cache key stays keyed on the SINGLE requested `categoryId` (not the
    // expanded subtree list) so it is stable and computed before any DB work —
    // a hit skips the subtree resolution entirely.
    const cacheKey = buildProductListKey({
      ...listParams,
      categoryId: query.categoryId,
      deviceModelId: query.deviceModelId,
      // Normalize via the parser so an ignored/malformed specs value never
      // fragments the cache key from an equivalent request.
      specs: parseSpecFilter(query.specs)
        ? `${parseSpecFilter(query.specs)!.key}:${parseSpecFilter(query.specs)!.value}`
        : undefined,
      isActive: true,
    });
    const cached = await this.cache.get<PaginatedProductsResponse>(cacheKey);
    if (cached) {
      return cached;
    }

    const params: FindAllParams = {
      ...listParams,
      isActive: true,
      categoryIds: await this.resolveSubtreeIds(query.categoryId),
    };
    const response = await this.listFromDb(params);

    // NOTE: as of the line-item contract change, cached list entries hold
    // `PublicProductEntity` items (no raw `stock`, with `inStock`/`lowStock`).
    // Any Redis warm-up entries written before this deploy carry the old shape
    // and must be evicted on rollout — the cache TTL otherwise self-heals.
    await this.cache.set(cacheKey, response, this.cacheTtlSeconds);
    return response;
  }

  /**
   * Admin — the same paginated listing but with the `isActive` filter respected
   * as sent (undefined = ALL products, including deactivated) and WITHOUT the
   * cache layer: the admin table must reflect activate/deactivate toggles
   * immediately, and admin traffic is too low to be worth caching (TASK-230).
   */
  async adminFindAll(query: ProductListQueryDto): Promise<AdminPaginatedProductsResponse> {
    const params: FindAllParams = {
      ...this.toListParams(query),
      categoryIds: await this.resolveSubtreeIds(query.categoryId),
    };
    return this.listFromDbForAdmin(params);
  }

  /**
   * Public — hydrate a bounded set of product CARDS by id (TASK-211, the
   * «Ви переглядали» rail). Returns full {@link PublicProductEntity} items
   * (with `variantSummary`, rating, primary image — the same enrichment as the
   * list) for the ACTIVE, non-deleted subset of `ids`, in request order.
   * Unknown, deactivated, or deleted ids are silently dropped, so a stale
   * client history self-heals. Duplicates are collapsed to the first
   * occurrence. Not cached: id combinations are per-visitor, so hit rates
   * would be negligible.
   */
  async getCardsByIds(ids: string[]): Promise<{ data: PublicProductEntity[] }> {
    const uniqueIds = [...new Set(ids)];
    const products = await this.productRepository.findByIdsForCards(uniqueIds);
    const byId = new Map(products.map((product) => [product.id, product]));
    const data = uniqueIds
      .map((id) => byId.get(id))
      .filter((product): product is NonNullable<typeof product> => product != null)
      .map((product) => PublicProductEntity.fromPrisma(product));
    return { data };
  }

  /**
   * Map the list query DTO onto repository params (shared defaults), MINUS the
   * category rollup — callers add `categoryIds` via {@link resolveSubtreeIds}
   * so the async subtree expansion happens once, after the cache check.
   */
  private toListParams(query: ProductListQueryDto): FindAllParams {
    return {
      page: query.page ?? 1,
      limit: query.limit ?? 20,
      brandId: query.brandId,
      deviceModelId: query.deviceModelId,
      isActive: query.isActive,
      minPrice: query.minPrice,
      maxPrice: query.maxPrice,
      search: query.search,
      specFilter: parseSpecFilter(query.specs),
      sortBy: query.sortBy ?? 'createdAt',
      sortOrder: query.sortOrder ?? 'desc',
    };
  }

  /**
   * Expand a single requested category id into its full subtree (self +
   * descendants) so filtering by a parent category rolls up every product filed
   * under it (TASK-236). Returns `undefined` when no category filter is
   * requested (the repository then applies no category constraint). Shared by
   * the public {@link findAll} and admin {@link adminFindAll} paths.
   */
  private async resolveSubtreeIds(categoryId?: string): Promise<string[] | undefined> {
    if (!categoryId) {
      return undefined;
    }
    return this.categoryRepository.findSubtreeIds(categoryId);
  }

  /** Run the repository listing and wrap it in the paginated envelope. */
  private async listFromDb(params: FindAllParams): Promise<PaginatedProductsResponse> {
    const { products, total } = await this.productRepository.findAll(params);
    const totalPages = Math.ceil(total / params.limit);

    return {
      data: products.map((product) => PublicProductEntity.fromPrisma(product)),
      meta: {
        total,
        page: params.page,
        limit: params.limit,
        totalPages,
      },
    };
  }

  /**
   * Admin variant of {@link listFromDb} (TASK-254). Reuses the exact same
   * paginated repository query (`findAll`) but builds {@link ProductEntity}
   * items — carrying raw `stock`, `isActive`, and the derived
   * `reservedQty`/`physicalQty` — instead of the public-safe `PublicProductEntity`.
   * The reserved aggregate is fetched once for the whole page (one `groupBy`),
   * never per-row.
   */
  private async listFromDbForAdmin(params: FindAllParams): Promise<AdminPaginatedProductsResponse> {
    const { products, total } = await this.productRepository.findAll(params);
    const reservedByProductId = await this.productRepository.getReservedQtyByProductId(
      products.map((product) => product.id),
    );
    const totalPages = Math.ceil(total / params.limit);

    return {
      data: products.map((product) =>
        ProductEntity.fromPrisma({
          ...product,
          reservedQty: reservedByProductId.get(product.id) ?? 0,
        }),
      ),
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

    const compatibleDeviceModels = await this.deviceCompatRepository.getDeviceCompat(product.id);
    const response: ProductDetailResponse = {
      data: PublicProductEntity.fromPrisma({ ...product, compatibleDeviceModels }),
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

    const compatibleDeviceModels = await this.deviceCompatRepository.getDeviceCompat(id);
    // Hydrate structured specs (TASK-191) so the admin edit form can seed its
    // spec editor. This detail cache is evicted whenever specs change
    // (updateSpecs → evictProductDetail), so it stays consistent.
    const specValues = await this.specRepository.getSpecs(id);
    // Derived reserved/physical for the admin edit form's stock breakdown (TASK-254).
    const reservedByProductId = await this.productRepository.getReservedQtyByProductId([id]);
    const entity = ProductEntity.fromPrisma({
      ...product,
      compatibleDeviceModels,
      specValues,
      reservedQty: reservedByProductId.get(id) ?? 0,
    });
    await this.cache.set(cacheKey, entity, this.cacheTtlSeconds);
    return entity;
  }

  /**
   * Get the full product detail by slug for admin preview (admin-only).
   *
   * Unlike {@link findBySlug}, this calls the repository with
   * `{ activeOnly: false }` so deactivated products ARE returned — letting staff
   * preview hidden products live before re-activating them (TASK-155). The RBAC
   * guard lives at the controller level (`AdminGuard`); soft-deleted rows remain
   * excluded by the repository regardless.
   *
   * Intentionally skips the public detail cache entirely: the response holds a
   * `ProductEntity` (raw `stock`, `isActive`) whereas the public cache holds a
   * `PublicProductEntity`. Writing here would poison `productDetailSlugKey` and
   * leak admin-only fields to public callers; reading from it would return the
   * wrong shape. Staff preview is infrequent, so a cache miss is acceptable.
   *
   * Throws NotFoundException when the slug does not resolve (missing or
   * soft-deleted).
   */
  async findBySlugForAdminPreview(slug: string): Promise<ProductDetailAdminResponse> {
    const product = await this.productRepository.findBySlugWithRelations(slug, {
      activeOnly: false,
    });

    if (!product) {
      throw new NotFoundException('Product not found');
    }

    const { category, group, images, ...productFields } = product;
    // Derived reserved/physical for the admin preview's stock rows (TASK-254).
    const reservedByProductId = await this.productRepository.getReservedQtyByProductId([
      product.id,
    ]);
    return {
      data: ProductEntity.fromPrisma({
        ...productFields,
        reservedQty: reservedByProductId.get(product.id) ?? 0,
      }),
      category: ProductCategoryEntity.fromPrisma(category),
      group: group ? ProductGroupEntity.fromPrisma(group) : null,
      images: images.map((img) => ProductImageEntity.fromPrisma(img)),
    };
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

    // Reject an unknown brand id up front (TASK-189).
    await this.ensureBrandExists(input.brandId);

    const product = await this.productRepository.create({
      ...input,
      slug,
    });

    // A new product may appear on any list page — bust every list cache entry.
    await this.cache.delByPrefix(PRODUCT_LIST_PREFIX);
    await this.syncSearchIndex(product);

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

    // Reject an unknown brand id when brandId is being (re)assigned (TASK-189).
    if (input.brandId !== undefined) {
      await this.ensureBrandExists(input.brandId);
    }

    const updatedProduct = await this.productRepository.update(id, input);

    // Evict list pages and both detail variants. The slug may have changed, so
    // evict the OLD slug captured above; if it changed, also evict the new one.
    await this.cache.delByPrefix(PRODUCT_LIST_PREFIX);
    await this.evictProductDetail(id, product.slug);
    if (input.slug !== undefined && input.slug !== product.slug) {
      await this.cache.del(productDetailSlugKey(input.slug));
    }
    await this.syncSearchIndex(updatedProduct);

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
    await this.syncSearchIndex(deactivatedProduct);

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
    await this.syncSearchIndex(activatedProduct);

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
    await this.syncSearchIndex(deleted);

    return ProductEntity.fromPrisma(deleted);
  }

  /**
   * Validate that a supplied brand id references an existing brand (TASK-189).
   * A null / undefined id means "no brand" and is always allowed. Throws
   * NotFoundException for an unknown brand so the write fails cleanly before it
   * hits the DB foreign key.
   */
  private async ensureBrandExists(brandId?: string | null): Promise<void> {
    if (brandId == null) {
      return;
    }
    const brand = await this.brandRepository.findById(brandId);
    if (!brand) {
      throw new NotFoundException('Brand not found');
    }
  }

  /**
   * Replace a product's device-compatibility set (admin-only, TASK-190).
   * Validates every device-model id exists (rejecting unknown ids with a 400
   * BEFORE any write), replaces the compat rows in one transaction, then evicts
   * the product's caches and re-indexes it. Returns the product with its new
   * `compatibleDeviceModels`.
   */
  async updateDeviceCompat(productId: string, deviceModelIds: string[]): Promise<ProductEntity> {
    const product = await this.productRepository.findById(productId);
    if (!product) {
      throw new NotFoundException('Product not found');
    }

    await this.assertDeviceModelsExist(deviceModelIds);
    await this.deviceCompatRepository.setDeviceCompat(productId, deviceModelIds);

    await this.cache.delByPrefix(PRODUCT_LIST_PREFIX);
    await this.evictProductDetail(productId, product.slug);
    await this.syncSearchIndex(product);

    const compatibleDeviceModels = await this.deviceCompatRepository.getDeviceCompat(productId);
    return ProductEntity.fromPrisma({ ...product, compatibleDeviceModels });
  }

  /**
   * Apply the same device-compatibility set to every position sharing `groupId`
   * (admin-only bulk action, TASK-190 — doc 099 §3). Validates the ids, then
   * writes the set to all sibling positions in one transaction. 404 if the group
   * has zero live positions. Returns the count of positions updated.
   */
  async updateGroupDeviceCompat(
    groupId: string,
    deviceModelIds: string[],
  ): Promise<{ updatedCount: number }> {
    const positionCount = await this.deviceCompatRepository.countGroupPositions(groupId);
    if (positionCount === 0) {
      throw new NotFoundException('Product group not found or has no positions');
    }

    await this.assertDeviceModelsExist(deviceModelIds);
    const { updatedCount, productIds } = await this.deviceCompatRepository.setDeviceCompatForGroup(
      groupId,
      deviceModelIds,
    );

    // Every affected position may change on any list page and its detail caches;
    // bust the list prefix once and re-index each position.
    await this.cache.delByPrefix(PRODUCT_LIST_PREFIX);
    for (const id of productIds) {
      await this.cache.del(productDetailIdKey(id));
      await this.syncSearchIndex({ id, isActive: true });
    }

    return { updatedCount };
  }

  /**
   * Validate that every id in `deviceModelIds` references an existing device
   * model. Throws 400 with the offending ids when any is unknown. An empty set
   * is valid (clears compat).
   */
  private async assertDeviceModelsExist(deviceModelIds: string[]): Promise<void> {
    const uniqueIds = [...new Set(deviceModelIds)];
    if (uniqueIds.length === 0) {
      return;
    }
    const found = await this.deviceRepository.findModelsByIds(uniqueIds);
    const foundIds = new Set(found.map((m) => m.id));
    const unknown = uniqueIds.filter((id) => !foundIds.has(id));
    if (unknown.length > 0) {
      throw new BadRequestException(`Unknown device model id(s): ${unknown.join(', ')}`);
    }
  }

  /**
   * Replace a product's structured spec VALUES (TASK-191, admin-only). Resolves
   * the product's EFFECTIVE definitions (own category + ancestors), validates
   * every incoming value against them, then writes the full set in one
   * transaction (replace-all — no partial writes). Returns the product with its
   * specs hydrated.
   *
   * Rejections (400, nothing written):
   *   - a `definitionId` not in the product's effective definition set;
   *   - a value that violates its definition's type (non-numeric for NUMBER,
   *     an option outside `options` for SELECT, non-boolean for BOOLEAN).
   *
   * Blank values are treated as "no value" and dropped, so the admin form can
   * submit its full effective-definition set with only the filled-in ones
   * persisting.
   */
  async updateSpecs(
    productId: string,
    incoming: Array<{ definitionId: string; value: string; valueNumber?: number | null }>,
  ): Promise<ProductEntity> {
    const product = await this.productRepository.findById(productId);
    if (!product) {
      throw new NotFoundException('Product not found');
    }

    const effective = await this.attributeDefinitionRepository.findEffectiveForCategory(
      product.categoryId,
    );
    const byId = new Map(effective.map((def) => [def.id, def]));

    const seen = new Set<string>();
    const writes: SpecValueWrite[] = [];
    for (const item of incoming) {
      // Blank value → clear this spec (skip persisting it).
      if (item.value === undefined || item.value === null || String(item.value).trim() === '') {
        continue;
      }

      const def = byId.get(item.definitionId);
      if (!def) {
        throw new BadRequestException(
          `Characteristic "${item.definitionId}" is not defined for this product's category`,
        );
      }
      if (seen.has(item.definitionId)) {
        throw new BadRequestException('Duplicate value for the same characteristic');
      }
      seen.add(item.definitionId);

      writes.push({ definitionId: def.id, ...this.validateSpecValue(def, item.value) });
    }

    await this.specRepository.setSpecs(productId, writes);

    await this.cache.delByPrefix(PRODUCT_LIST_PREFIX);
    await this.evictProductDetail(productId, product.slug);

    const specValues = await this.specRepository.getSpecs(productId);
    return ProductEntity.fromPrisma({ ...product, specValues });
  }

  /**
   * Validate and canonicalize a single spec value against its definition's type.
   * Returns the canonical string `value` (used for exact facet matching) plus an
   * optional numeric mirror for NUMBER-typed definitions. Throws
   * BadRequestException on a type mismatch.
   */
  private validateSpecValue(
    def: AttributeDefinition,
    raw: string,
  ): { value: string; valueNumber?: number | null } {
    switch (def.type) {
      case AttributeType.NUMBER: {
        const num = Number(raw);
        if (Number.isNaN(num)) {
          throw new BadRequestException(`"${def.label}" must be a number`);
        }
        return { value: String(num), valueNumber: num };
      }
      case AttributeType.BOOLEAN: {
        const normalized = String(raw).trim().toLowerCase();
        if (normalized !== 'true' && normalized !== 'false') {
          throw new BadRequestException(`"${def.label}" must be true or false`);
        }
        return { value: normalized };
      }
      case AttributeType.SELECT: {
        const options = Array.isArray(def.options)
          ? (def.options as unknown[]).filter((o): o is string => typeof o === 'string')
          : [];
        if (!options.includes(raw)) {
          throw new BadRequestException(`"${raw}" is not an allowed option for "${def.label}"`);
        }
        return { value: raw };
      }
      case AttributeType.TEXT:
      default:
        return { value: String(raw) };
    }
  }

  /**
   * Evict both detail cache variants (by id and by slug) for a product. Cache
   * errors are swallowed inside CacheService, so this never affects the caller.
   */
  private async evictProductDetail(id: string, slug: string): Promise<void> {
    await this.cache.del(productDetailIdKey(id));
    await this.cache.del(productDetailSlugKey(slug));
  }

  /**
   * Keep the Meilisearch index in step with a product mutation (TASK-075):
   * active products are (re)indexed, inactive ones removed. **Best-effort** —
   * any failure is swallowed here so a down/unconfigured search engine can never
   * block or fail the product write. The `ProductIndexer` itself also logs and
   * degrades gracefully; this catch is the belt-and-braces guard the spec
   * asserts (a throwing indexer must not fail the mutation).
   */
  private async syncSearchIndex(product: { id: string; isActive: boolean }): Promise<void> {
    try {
      if (product.isActive) {
        await this.productIndexer.index(product.id);
      } else {
        await this.productIndexer.remove(product.id);
      }
    } catch {
      // Swallowed: indexing is never allowed to affect the product write.
    }
  }
}
