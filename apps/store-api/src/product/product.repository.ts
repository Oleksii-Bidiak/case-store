import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma';
import { Product, Prisma } from '@prisma/client';

/**
 * Parameters for paginated product queries with filtering.
 */
export interface FindAllParams {
  page: number;
  limit: number;
  /**
   * Category filter as an already-expanded id set (self + subtree). The service
   * resolves a single requested `categoryId` into this list via
   * `CategoryRepository.findSubtreeIds` (TASK-236) so filtering by a parent
   * category rolls up every product filed under it; the repository does not own
   * that cross-entity rule.
   */
  categoryIds?: string[];
  /**
   * Manufacturer filter (TASK-189). A single brand id, applied alongside the
   * category rollup in the same `where` clause so brand + category compose.
   */
  brandId?: string;
  isActive?: boolean;
  minPrice?: number;
  maxPrice?: number;
  search?: string;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

/**
 * Brand summary joined onto product read rows (TASK-189). Nested on list/detail
 * responses so the storefront can surface the manufacturer.
 */
export interface ProductBrandSummary {
  id: string;
  name: string;
  slug: string;
  logo: string | null;
}

/** Prisma select for the joined brand summary — shared by every read include. */
const BRAND_SUMMARY_SELECT = { id: true, name: true, slug: true, logo: true } as const;

/**
 * Allowed fields for creating a product.
 */
export interface CreateProductInput {
  name: string;
  slug?: string;
  description?: string | null;
  price: number;
  compareAtPrice?: number | null;
  sku?: string | null;
  stock?: number;
  categoryId: string;
  groupId?: string | null;
  brandId?: string | null;
  attributes?: Record<string, string> | null;
  positionOrder?: number;
  isActive?: boolean;
}

/**
 * Allowed fields for updating a product.
 * Only provided fields will be updated.
 */
export interface UpdateProductInput {
  name?: string;
  slug?: string;
  description?: string | null;
  price?: number;
  compareAtPrice?: number | null;
  sku?: string | null;
  stock?: number;
  categoryId?: string;
  groupId?: string | null;
  brandId?: string | null;
  attributes?: Record<string, string> | null;
  positionOrder?: number;
  isActive?: boolean;
}

/**
 * Aggregated approved-review rating for a product. `ratingAverage` is null
 * when the product has no approved reviews.
 */
export interface ProductRating {
  ratingAverage: number | null;
  ratingCount: number;
}

/**
 * Source shape for building a Meilisearch document (TASK-075). Carries the
 * public-safe fields a result/suggestion card needs — category name + primary
 * image are joined in so the search index is self-contained. `price` stays a
 * Prisma Decimal here; the search service converts it to a number for the index.
 */
export interface ProductIndexSource {
  id: string;
  name: string;
  description: string | null;
  price: { toString(): string };
  compareAtPrice: { toString(): string } | null;
  slug: string;
  categoryId: string;
  categoryName: string;
  /** Manufacturer id/name joined for the search brand facet (TASK-189). */
  brandId: string | null;
  brandName: string | null;
  primaryImageUrl: string | null;
  blurDataUrl: string | null;
  stock: number;
  isActive: boolean;
  createdAt: Date;
}

/**
 * Primary image shape attached to list rows (and used by the detail include).
 */
export interface PrimaryImage {
  id: string;
  url: string;
  alt: string | null;
  blurDataUrl: string | null;
  sortOrder: number;
  isPrimary: boolean;
}

/**
 * A lightweight active sibling position used to build a product's variant
 * summary on the list response (TASK-077): distinct colours, advertised "from"
 * price, and the default (cheapest) variant for quick-add.
 */
export interface VariantSiblingLite {
  id: string;
  slug: string;
  price: { toString(): string };
  attributes: unknown;
  stock: number;
  positionOrder: number;
}

/**
 * Result of a paginated product query. Each product is enriched with its
 * approved-review aggregate (for star ratings), its primary image (for cards),
 * and the active sibling positions of its variant group (for the variant
 * summary). `variantSiblings` is absent for standalone products (no group).
 */
export interface PaginatedProductsResult {
  products: (Product &
    ProductRating & {
      brand: ProductBrandSummary | null;
      primaryImage: PrimaryImage | null;
      variantSiblings?: VariantSiblingLite[];
    })[];
  total: number;
}

/**
 * A sibling position in the same group (TASK-142): another buyable Product row
 * the PDP can navigate to when the shopper changes an attribute axis.
 */
export interface SiblingPosition {
  id: string;
  slug: string;
  name: string;
  price: { toString(): string };
  attributes: unknown;
  stock: number;
  isActive: boolean;
  positionOrder: number;
}

/**
 * The group a position belongs to, with its attribute axes and sibling
 * positions, used to render the PDP's attribute selectors and cross-navigation.
 */
export interface ProductGroupRelation {
  id: string;
  name: string;
  axes: Array<{ name: string; sortOrder: number }>;
  positions: SiblingPosition[];
}

/**
 * Product with related category, group (siblings + axes), and images.
 * Used for the product detail endpoint.
 */
export interface ProductWithRelations {
  product: Product &
    ProductRating & {
      category: { id: string; name: string; slug: string };
      brand: ProductBrandSummary | null;
      group: ProductGroupRelation | null;
      images: Array<{
        id: string;
        url: string;
        alt: string | null;
        blurDataUrl: string | null;
        sortOrder: number;
        isPrimary: boolean;
      }>;
    };
}

@Injectable()
export class ProductRepository {
  private readonly logger = new Logger(ProductRepository.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Aggregate approved-review ratings for a set of products in a single query.
   * Returns a map keyed by product id; products with no approved reviews are
   * absent from the map (callers default them to `{ null, 0 }`).
   */
  private async getRatingsByProductId(productIds: string[]): Promise<Map<string, ProductRating>> {
    if (productIds.length === 0) {
      return new Map();
    }
    const groups = await this.prisma.review.groupBy({
      by: ['productId'],
      where: { productId: { in: productIds }, isActive: true },
      _avg: { rating: true },
      _count: { rating: true },
    });
    return new Map(
      groups.map((g) => [
        g.productId,
        { ratingAverage: g._avg.rating, ratingCount: g._count.rating },
      ]),
    );
  }

  /**
   * Find a product by ID.
   * Returns the product record or null if not found.
   *
   * Excludes soft-deleted products (`deletedAt IS NOT NULL`). `findFirst` is
   * used instead of `findUnique` because the `deletedAt: null` guard is not part
   * of a unique index.
   */
  findById(id: string): Promise<(Product & { brand: ProductBrandSummary | null }) | null> {
    return this.prisma.product.findFirst({
      where: { id, deletedAt: null },
      include: { brand: { select: BRAND_SUMMARY_SELECT } },
    });
  }

  /**
   * Find a product by slug.
   * Returns the product record or null if not found. Excludes soft-deleted rows.
   */
  findBySlug(slug: string): Promise<Product | null> {
    return this.prisma.product.findFirst({ where: { slug, deletedAt: null } });
  }

  /**
   * Find a product by SKU.
   * Returns the product record or null if not found. Excludes soft-deleted rows.
   */
  findBySku(sku: string): Promise<Product | null> {
    return this.prisma.product.findFirst({ where: { sku, deletedAt: null } });
  }

  /**
   * Find a product position by slug with its category, group (sibling positions
   * + attribute axes), and images. Used for the public product detail endpoint.
   * Excludes soft-deleted rows. Sibling positions are the other active,
   * non-deleted positions in the same group, ordered by `positionOrder`
   * (TASK-142).
   *
   * @param slug - the product slug to look up.
   * @param options.activeOnly - when `true` (the default), only active products
   *   are returned; a deactivated product resolves to `null` so the public PDP
   *   surfaces a 404 (TASK-145). Pass `false` to bypass the `isActive` filter for
   *   staff preview of deactivated products (reserved for TASK-155); soft-deleted
   *   rows remain excluded regardless.
   */
  async findBySlugWithRelations(
    slug: string,
    options?: { activeOnly?: boolean },
  ): Promise<ProductWithRelations['product'] | null> {
    const product = await this.prisma.product.findFirst({
      where: {
        slug,
        deletedAt: null,
        ...((options?.activeOnly ?? true) ? { isActive: true } : {}),
      },
      include: {
        category: {
          select: { id: true, name: true, slug: true },
        },
        brand: { select: BRAND_SUMMARY_SELECT },
        group: {
          include: {
            axes: {
              orderBy: { sortOrder: 'asc' },
              select: { name: true, sortOrder: true },
            },
            positions: {
              where: { isActive: true, deletedAt: null },
              orderBy: { positionOrder: 'asc' },
              select: {
                id: true,
                slug: true,
                name: true,
                price: true,
                attributes: true,
                stock: true,
                isActive: true,
                positionOrder: true,
              },
            },
          },
        },
        images: {
          orderBy: { sortOrder: 'asc' },
          select: {
            id: true,
            url: true,
            alt: true,
            blurDataUrl: true,
            sortOrder: true,
            isPrimary: true,
          },
        },
      },
    });

    if (!product) {
      return null;
    }

    const ratings = await this.getRatingsByProductId([product.id]);
    const rating = ratings.get(product.id);
    const { group, ...rest } = product;
    return {
      ...rest,
      group: group
        ? { id: group.id, name: group.name, axes: group.axes, positions: group.positions }
        : null,
      ratingAverage: rating?.ratingAverage ?? null,
      ratingCount: rating?.ratingCount ?? 0,
    };
  }

  /**
   * Find all products with pagination and optional filtering.
   * Supports filtering by category, active status, price range,
   * and text search across name and description fields.
   *
   * Returns the paginated product list and total count for pagination metadata.
   */
  async findAll(params: FindAllParams): Promise<PaginatedProductsResult> {
    const {
      page,
      limit,
      categoryIds,
      brandId,
      isActive,
      minPrice,
      maxPrice,
      search,
      sortBy = 'createdAt',
      sortOrder = 'desc',
    } = params;
    const skip = (page - 1) * limit;

    // Build the where clause from optional filters. Soft-deleted products
    // (tombstoned) must never appear in any listing, regardless of filters.
    const where: Prisma.ProductWhereInput = { deletedAt: null };

    // Subtree rollup (TASK-236): the service passes the expanded category id set
    // (self + descendants), matched with `IN (...)` so a parent category returns
    // its subcategories' products too.
    if (categoryIds !== undefined) {
      where.categoryId = { in: categoryIds };
    }

    // Manufacturer filter (TASK-189) — composes with the category rollup above.
    if (brandId !== undefined) {
      where.brandId = brandId;
    }

    if (isActive !== undefined) {
      where.isActive = isActive;
    }

    if (minPrice !== undefined || maxPrice !== undefined) {
      where.price = {};
      if (minPrice !== undefined) {
        (where.price as Prisma.DecimalFilter).gte = minPrice;
      }
      if (maxPrice !== undefined) {
        (where.price as Prisma.DecimalFilter).lte = maxPrice;
      }
    }

    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { description: { contains: search, mode: 'insensitive' } },
      ];
    }

    // Validate and map sort field
    const allowedSortFields: Record<string, string> = {
      createdAt: 'createdAt',
      price: 'price',
      name: 'name',
    };
    const sortField = allowedSortFields[sortBy];
    if (!sortField) {
      this.logger.warn(`Invalid sort field: ${sortBy}, falling back to createdAt`);
    }
    const effectiveSortField = sortField ?? 'createdAt';

    const [products, total] = await Promise.all([
      this.prisma.product.findMany({
        where,
        skip,
        take: limit,
        orderBy: { [effectiveSortField]: sortOrder },
        include: { brand: { select: BRAND_SUMMARY_SELECT } },
      }),
      this.prisma.product.count({ where }),
    ]);

    const productIds = products.map((p) => p.id);
    const groupIds = [
      ...new Set(products.map((p) => p.groupId).filter((id): id is string => id != null)),
    ];
    const [ratings, primaryImages, variantSiblings] = await Promise.all([
      this.getRatingsByProductId(productIds),
      this.getPrimaryImagesByProductId(productIds),
      this.getVariantSiblingsByGroupId(groupIds),
    ]);
    const enriched = products.map((product) => {
      const rating = ratings.get(product.id);
      return {
        ...product,
        ratingAverage: rating?.ratingAverage ?? null,
        ratingCount: rating?.ratingCount ?? 0,
        primaryImage: primaryImages.get(product.id) ?? null,
        variantSiblings: product.groupId ? (variantSiblings.get(product.groupId) ?? []) : undefined,
      };
    });

    return { products: enriched, total };
  }

  /**
   * Resolve the primary image for a set of products in a single query (no N+1).
   * Prefers the `isPrimary` image, falling back to the lowest `sortOrder`.
   * Returns a Map keyed by productId; products without images are absent.
   */
  private async getPrimaryImagesByProductId(
    productIds: string[],
  ): Promise<Map<string, PrimaryImage>> {
    if (productIds.length === 0) {
      return new Map();
    }
    const rows = await this.prisma.productImage.findMany({
      where: { productId: { in: productIds } },
      orderBy: [{ isPrimary: 'desc' }, { sortOrder: 'asc' }],
      select: {
        id: true,
        productId: true,
        url: true,
        alt: true,
        blurDataUrl: true,
        sortOrder: true,
        isPrimary: true,
      },
    });
    const map = new Map<string, PrimaryImage>();
    for (const row of rows) {
      if (!map.has(row.productId)) {
        const { productId, ...image } = row;
        map.set(productId, image);
      }
    }
    return map;
  }

  /**
   * Fetch the active sibling positions for a set of variant groups in a single
   * query (no N+1), keyed by groupId. Only active, non-deleted positions are
   * returned — these drive the list-card variant summary (colours, "from" price,
   * default quick-add variant). Groups with no active positions are absent.
   */
  private async getVariantSiblingsByGroupId(
    groupIds: string[],
  ): Promise<Map<string, VariantSiblingLite[]>> {
    if (groupIds.length === 0) {
      return new Map();
    }
    const rows = await this.prisma.product.findMany({
      where: { groupId: { in: groupIds }, isActive: true, deletedAt: null },
      orderBy: { positionOrder: 'asc' },
      select: {
        id: true,
        slug: true,
        groupId: true,
        price: true,
        attributes: true,
        stock: true,
        positionOrder: true,
      },
    });
    const map = new Map<string, VariantSiblingLite[]>();
    for (const row of rows) {
      if (row.groupId == null) {
        continue;
      }
      const { groupId, ...sibling } = row;
      const bucket = map.get(groupId);
      if (bucket) {
        bucket.push(sibling);
      } else {
        map.set(groupId, [sibling]);
      }
    }
    return map;
  }

  /**
   * Enrich a set of products by id for card rendering (TASK-075 search-results
   * hydration). Meilisearch returns the matching ids ranked by relevance; this
   * loads the full active, non-deleted products with the same rating / primary
   * image / variant-sibling enrichment as {@link findAll}. Order is NOT
   * preserved here — the caller reorders by the Meili hit order.
   */
  async findByIdsForCards(ids: string[]): Promise<PaginatedProductsResult['products']> {
    if (ids.length === 0) {
      return [];
    }
    const products = await this.prisma.product.findMany({
      where: { id: { in: ids }, isActive: true, deletedAt: null },
      include: { brand: { select: BRAND_SUMMARY_SELECT } },
    });

    const productIds = products.map((p) => p.id);
    const groupIds = [
      ...new Set(products.map((p) => p.groupId).filter((id): id is string => id != null)),
    ];
    const [ratings, primaryImages, variantSiblings] = await Promise.all([
      this.getRatingsByProductId(productIds),
      this.getPrimaryImagesByProductId(productIds),
      this.getVariantSiblingsByGroupId(groupIds),
    ]);
    return products.map((product) => {
      const rating = ratings.get(product.id);
      return {
        ...product,
        ratingAverage: rating?.ratingAverage ?? null,
        ratingCount: rating?.ratingCount ?? 0,
        primaryImage: primaryImages.get(product.id) ?? null,
        variantSiblings: product.groupId ? (variantSiblings.get(product.groupId) ?? []) : undefined,
      };
    });
  }

  /**
   * Load a single active, non-deleted product as a search-index source
   * (TASK-075). Joins the category name + primary image so the built document is
   * self-contained. Returns null when the product is missing, soft-deleted, or
   * deactivated — the search service then removes it from the index instead.
   */
  async findOneForIndex(id: string): Promise<ProductIndexSource | null> {
    const product = await this.prisma.product.findFirst({
      where: { id, isActive: true, deletedAt: null },
      include: {
        category: { select: { name: true } },
        brand: { select: { name: true } },
        images: {
          orderBy: [{ isPrimary: 'desc' }, { sortOrder: 'asc' }],
          take: 1,
          select: { url: true, blurDataUrl: true },
        },
      },
    });
    return product ? this.toIndexSource(product) : null;
  }

  /**
   * Batch-pull active, non-deleted products as search-index sources (TASK-075
   * `reindexAll`). Ordered by `createdAt` for a stable pagination cursor.
   */
  async findManyForIndex(skip: number, take: number): Promise<{ items: ProductIndexSource[] }> {
    const rows = await this.prisma.product.findMany({
      where: { isActive: true, deletedAt: null },
      orderBy: { createdAt: 'asc' },
      skip,
      take,
      include: {
        category: { select: { name: true } },
        brand: { select: { name: true } },
        images: {
          orderBy: [{ isPrimary: 'desc' }, { sortOrder: 'asc' }],
          take: 1,
          select: { url: true, blurDataUrl: true },
        },
      },
    });
    return { items: rows.map((row) => this.toIndexSource(row)) };
  }

  /** Map a Prisma product (with category + primary image joined) to an index source. */
  private toIndexSource(
    product: Product & {
      category: { name: string } | null;
      brand: { name: string } | null;
      images: Array<{ url: string; blurDataUrl: string | null }>;
    },
  ): ProductIndexSource {
    const image = product.images[0];
    return {
      id: product.id,
      name: product.name,
      description: product.description,
      price: product.price,
      compareAtPrice: product.compareAtPrice,
      slug: product.slug,
      categoryId: product.categoryId,
      categoryName: product.category?.name ?? '',
      brandId: product.brandId,
      brandName: product.brand?.name ?? null,
      primaryImageUrl: image?.url ?? null,
      blurDataUrl: image?.blurDataUrl ?? null,
      stock: product.stock,
      isActive: product.isActive,
      createdAt: product.createdAt,
    };
  }

  /**
   * Create a new product.
   * Slug is required — the service must generate it if not provided by the client.
   * Returns the created product record.
   */
  create(data: CreateProductInput & { slug: string }): Promise<Product> {
    return this.prisma.product.create({
      data: {
        name: data.name,
        slug: data.slug,
        description: data.description ?? null,
        price: data.price,
        compareAtPrice: data.compareAtPrice ?? null,
        sku: data.sku ?? null,
        stock: data.stock ?? 0,
        categoryId: data.categoryId,
        groupId: data.groupId ?? null,
        brandId: data.brandId ?? null,
        attributes: (data.attributes ?? {}) as Prisma.InputJsonValue,
        positionOrder: data.positionOrder ?? 0,
        isActive: data.isActive ?? true,
      },
    });
  }

  /**
   * Update a product's fields.
   * Only the fields provided in the data object will be updated.
   * Returns the updated product record.
   */
  update(id: string, data: UpdateProductInput): Promise<Product> {
    const { attributes, ...rest } = data;
    return this.prisma.product.update({
      where: { id },
      data: {
        ...rest,
        ...(attributes !== undefined
          ? { attributes: (attributes ?? {}) as Prisma.InputJsonValue }
          : {}),
      },
    });
  }

  /**
   * Deactivate a product by setting isActive = false.
   * Returns the updated product record.
   */
  deactivate(id: string): Promise<Product> {
    return this.prisma.product.update({
      where: { id },
      data: { isActive: false },
    });
  }

  /**
   * Activate a product by setting isActive = true.
   * Returns the updated product record.
   */
  activate(id: string): Promise<Product> {
    return this.prisma.product.update({
      where: { id },
      data: { isActive: true },
    });
  }

  /**
   * Soft-delete a product (TASK-104): stamp `deletedAt`, set `isActive = false`,
   * and replace the unique `slug`/`sku` with caller-supplied mangled values so
   * those unique slots are freed for new products. The row itself is kept so
   * historical OrderItems still resolve the product name.
   *
   * Mangling is done in the service (read-then-build) to keep this method a
   * simple write; pass `mangledSku = null` when the product had no SKU.
   */
  softDelete(id: string, mangledSlug: string, mangledSku: string | null): Promise<Product> {
    return this.prisma.product.update({
      where: { id },
      data: {
        deletedAt: new Date(),
        isActive: false,
        slug: mangledSlug,
        sku: mangledSku,
      },
    });
  }
}
