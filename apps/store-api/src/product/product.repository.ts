import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma';
import { Product, Prisma, AttributeType, PaymentStatus, SlugRedirectEntity } from '@prisma/client';
import { SlugRedirectRepository } from '../slug-redirect';
import { rankProductIdsBySales } from './bestseller-rank.util';
import { PRE_SHIPMENT_STATUSES } from '../order/order.constants';

/**
 * Slugs of a rename being persisted by this update — when present, the write
 * additionally records a 301 redirect `oldSlug → newSlug` in the SlugRedirect
 * ledger, atomically with the product update (TASK-285-G). The service passes
 * it only when the product was publicly visible (active) before the write
 * (plan 147 §Design Decision 3).
 */
export interface SlugRenameInput {
  oldSlug: string;
  newSlug: string;
}

/**
 * Raised by {@link ProductRepository.setActiveMany} when the batch names a
 * product that does not exist (or is soft-deleted), so the transaction rolls
 * back instead of half-applying.
 *
 * A domain error rather than a `NotFoundException`: repositories do not speak
 * HTTP in this codebase. `ProductService` maps it — the same split the category
 * module makes with `CategoryNotFoundError` (`category.errors.ts`), kept local
 * here because it is the product module's only one and a whole error hierarchy
 * for it would be ceremony.
 */
export class ProductsNotFoundError extends Error {
  constructor(readonly missingIds: string[]) {
    super(`Unknown product id(s): ${missingIds.join(', ')}`);
    this.name = 'ProductsNotFoundError';
  }
}

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
  /**
   * Device-compatibility filter (TASK-190): when set, only products with a
   * `ProductDeviceCompat` row for this device model are returned. Applied as a
   * nested relation filter through the join table.
   */
  deviceModelId?: string;
  isActive?: boolean;
  /**
   * Withdraw the products of DEACTIVATED categories from the result set
   * (TASK-297). `isActive: false` on a category means "removed from sale", so
   * every PUBLIC read passes `true` here; the admin listing leaves it unset and
   * keeps seeing the full catalogue (it is how an operator finds the products
   * stranded by the deactivation in the first place).
   *
   * Scope is the product's OWN category, not its ancestor chain — deactivation
   * deliberately does NOT cascade to descendant categories (the `setActiveMany`
   * owner decision), so neither does this filter.
   */
  categoryActiveOnly?: boolean;
  /**
   * Push everything out of stock behind everything in stock, ahead of the
   * requested sort (TASK-362). Set on the PUBLIC listing only: a shopper sorting
   * by price still wants the things they can actually buy first, whereas the
   * admin is often looking for exactly the zero-stock rows and must not have
   * them shuffled to the back.
   */
  inStockFirst?: boolean;
  /** Keep only positions with zero free-to-sell stock (TASK-362). */
  outOfStock?: boolean;
  minPrice?: number;
  maxPrice?: number;
  search?: string;
  /**
   * Extend `search` to the internal article number (TASK-406, AD-PROD-08).
   *
   * OFF by default and set ONLY from `ProductService.adminFindAll`: this
   * `findAll` is shared by the public storefront listing and the admin table,
   * and an SKU is an internal identifier — a supplier code, a stock label —
   * that nobody outside the shop should be able to probe for through the public
   * search box. The operator, on the other hand, looks a position up by exactly
   * that number, which is why the flag exists at all.
   */
  searchIncludesSku?: boolean;
  /**
   * Structured-spec facet filter (TASK-191): keep only products carrying a
   * spec value whose definition `key` and `value` both match. A single pair for
   * this "basic" cut (doc 099 §6); multi-pair stacking is a future enhancement.
   */
  specFilter?: { key: string; value: string };
  /**
   * On-sale filter (TASK-179): keep only products whose `compareAtPrice` is set
   * and strictly greater than `price`. A same-row column-to-column comparison
   * Prisma's typed `where` can't express, so it is resolved via a raw-SQL id
   * prefetch (`getOnSaleProductIds`) fed into `where.id IN (...)`.
   */
  onSale?: boolean;
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

/** A product row with its brand summary joined in — the shared list read shape. */
type ProductWithBrand = Product & { brand: ProductBrandSummary | null };

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
  metaTitle?: string | null;
  metaDescription?: string | null;
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
  metaTitle?: string | null;
  metaDescription?: string | null;
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
  /** Compatible device-model ids for the Meilisearch `deviceModelIds` facet (TASK-190). */
  deviceModelIds: string[];
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
      // Structured spec values joined with their definition (TASK-191), for the
      // PDP "Характеристики" table + highlights hydration.
      specValues: Array<{
        value: string;
        definition: {
          key: string;
          label: string;
          type: AttributeType;
          unit: string | null;
          isFilterable: boolean;
          sortOrder: number;
        };
      }>;
    };
}

@Injectable()
export class ProductRepository {
  private readonly logger = new Logger(ProductRepository.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly slugRedirectRepository: SlugRedirectRepository,
  ) {}

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
   * @param options.activeOnly - when `true` (the default), only products that are
   *   ON SALE are returned — the product itself must be active AND so must its
   *   category (TASK-297), since deactivating a category withdraws its products.
   *   Either way the public PDP surfaces a 404 (TASK-145). Pass `false` to bypass
   *   both filters for staff preview of withdrawn products (TASK-155);
   *   soft-deleted rows remain excluded regardless.
   */
  async findBySlugWithRelations(
    slug: string,
    options?: { activeOnly?: boolean },
  ): Promise<ProductWithRelations['product'] | null> {
    const product = await this.prisma.product.findFirst({
      where: {
        slug,
        deletedAt: null,
        ...((options?.activeOnly ?? true) ? { isActive: true, category: { isActive: true } } : {}),
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
        specValues: {
          orderBy: [{ definition: { sortOrder: 'asc' } }, { definition: { label: 'asc' } }],
          select: {
            value: true,
            definition: {
              select: {
                key: true,
                label: true,
                type: true,
                unit: true,
                isFilterable: true,
                sortOrder: true,
              },
            },
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
      deviceModelId,
      isActive,
      categoryActiveOnly,
      minPrice,
      maxPrice,
      search,
      specFilter,
      onSale,
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

    // Device-compatibility filter (TASK-190): match products that have a compat
    // join row for the requested device model. The `@@index([deviceModelId])` on
    // `ProductDeviceCompat` covers this lookup direction.
    if (deviceModelId !== undefined) {
      where.deviceCompat = { some: { deviceModelId } };
    }

    if (isActive !== undefined) {
      where.isActive = isActive;
    }

    // Restock worklist (TASK-362): positions with nothing free to sell.
    if (params.outOfStock) {
      where.stock = { lte: 0 };
    }

    // Withdraw the products of deactivated categories (TASK-297). A relation
    // filter, so it composes with the `categoryIds` subtree rollup above rather
    // than replacing it: a parent-category rollup still returns only the
    // products whose own category is on sale.
    if (categoryActiveOnly) {
      where.category = { isActive: true };
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
      const searchOr: Prisma.ProductWhereInput[] = [
        { name: { contains: search, mode: 'insensitive' } },
        { description: { contains: search, mode: 'insensitive' } },
      ];
      // The article number joins the search only on the admin path (TASK-406):
      // `params.searchIncludesSku` is set by `adminFindAll` and by nothing else,
      // so the public storefront listing — which calls this very method — cannot
      // be used to probe internal SKUs.
      if (params.searchIncludesSku) {
        searchOr.push({ sku: { contains: search, mode: 'insensitive' } });
      }
      where.OR = searchOr;
    }

    // Structured-spec facet (TASK-191): the product must have at least one spec
    // value whose definition key AND value both match the requested pair.
    if (specFilter) {
      where.specValues = {
        some: { value: specFilter.value, definition: { key: specFilter.key } },
      };
    }

    // On-sale (TASK-179): `compareAtPrice > price` is a same-row column-to-column
    // comparison Prisma's typed `where` cannot express, so resolve the matching
    // ids with one raw query and AND them into `where.id`. Baked into `where`
    // BEFORE skip/take/count and BEFORE the bestselling branch, so it composes
    // with every other filter AND both sort paths, and pagination stays correct.
    // Only queried when the filter is active — zero added cost otherwise.
    if (onSale) {
      const onSaleIds = await this.getOnSaleProductIds();
      where.id = { in: onSaleIds };
    }

    // Bestselling (TASK-164) ranks by an aggregate over PAID order items rather
    // than a scalar column, so it takes a dedicated ranking path; every other
    // sort maps to a plain column order.
    const { products, total } =
      sortBy === 'bestselling'
        ? await this.findPageByBestselling(where, skip, limit)
        : await this.findPageByColumn(where, skip, limit, sortBy, sortOrder, params.inStockFirst);

    const enriched = await this.enrichProducts(products);
    return { products: enriched, total };
  }

  /**
   * Ids of every product currently on sale — `compareAtPrice` set AND strictly
   * greater than `price` (TASK-179). A raw query because Prisma's typed `where`
   * can't compare two columns of the same row. Queries the real snake_case
   * table/columns (`products` / `compare_at_price` / `price`). No
   * `deleted_at`/`is_active` guard here: the caller ANDs these ids into the
   * outer `where`, which already enforces both — a soft-deleted or inactive
   * on-sale row simply intersects to nothing.
   */
  private async getOnSaleProductIds(): Promise<string[]> {
    const rows = await this.prisma.$queryRaw<{ id: string }[]>(
      Prisma.sql`SELECT id FROM products WHERE compare_at_price IS NOT NULL AND compare_at_price > price`,
    );
    return rows.map((row) => row.id);
  }

  /** Standard column-ordered page (createdAt / price / name). */
  private async findPageByColumn(
    where: Prisma.ProductWhereInput,
    skip: number,
    limit: number,
    sortBy: string | undefined,
    sortOrder: 'asc' | 'desc',
    inStockFirst = false,
  ): Promise<{ products: ProductWithBrand[]; total: number }> {
    const allowedSortFields: Record<string, string> = {
      createdAt: 'createdAt',
      price: 'price',
      name: 'name',
      // Admin "Вільно" sort by available stock (TASK-254).
      stock: 'stock',
    };
    const sortField = allowedSortFields[sortBy ?? 'createdAt'];
    if (!sortField) {
      this.logger.warn(`Invalid sort field: ${sortBy}, falling back to createdAt`);
    }
    const effectiveSortField = sortField ?? 'createdAt';

    // `id` is always the last key. None of the sortable columns is unique: an
    // import writes many products with the same `createdAt`, a price list
    // repeats prices, and `stock` repeats constantly. Postgres is free to
    // return tied rows in a different order on every query, so paginating over
    // an unstable ordering makes a product appear on two pages and another on
    // none — with the totals still adding up, so nothing looks wrong until
    // someone counts. Same defect this wave fixed in `user.repository.ts`
    // (plan 168 §10.4).
    const orderBy: Prisma.ProductOrderByWithRelationInput[] = [
      { [effectiveSortField]: sortOrder },
      { id: 'asc' },
    ];

    if (inStockFirst) {
      return this.findPageInStockFirst(where, skip, limit, orderBy);
    }

    const [products, total] = await Promise.all([
      this.prisma.product.findMany({
        where,
        skip,
        take: limit,
        orderBy,
        include: { brand: { select: BRAND_SUMMARY_SELECT } },
      }),
      this.prisma.product.count({ where }),
    ]);
    return { products, total };
  }

  /**
   * The same page, but with everything out of stock pushed behind everything in
   * stock (TASK-362).
   *
   * Prisma cannot order by an expression, and ordering by `stock` itself is not
   * the same thing — that would rank a product with 100 units above one with 5,
   * reshuffling the whole catalogue instead of just moving the zeroes to the
   * end. So the page is assembled from two independently-ordered partitions,
   * which also keeps each partition's ordering as stable as the single-query
   * path above.
   *
   * Requesting a page wholly inside one partition costs the same two queries as
   * before; only a page that straddles the boundary needs a third.
   */
  private async findPageInStockFirst(
    where: Prisma.ProductWhereInput,
    skip: number,
    limit: number,
    orderBy: Prisma.ProductOrderByWithRelationInput[],
  ): Promise<{ products: ProductWithBrand[]; total: number }> {
    const inStockWhere: Prisma.ProductWhereInput = { ...where, stock: { gt: 0 } };
    const outOfStockWhere: Prisma.ProductWhereInput = { ...where, stock: { lte: 0 } };
    const include = { brand: { select: BRAND_SUMMARY_SELECT } };

    const [inStockTotal, total] = await Promise.all([
      this.prisma.product.count({ where: inStockWhere }),
      this.prisma.product.count({ where }),
    ]);

    // Entirely past the in-stock partition: page the remainder directly.
    if (skip >= inStockTotal) {
      const products = await this.prisma.product.findMany({
        where: outOfStockWhere,
        skip: skip - inStockTotal,
        take: limit,
        orderBy,
        include,
      });
      return { products, total };
    }

    const inStock = await this.prisma.product.findMany({
      where: inStockWhere,
      skip,
      take: limit,
      orderBy,
      include,
    });

    // Entirely inside the in-stock partition.
    if (inStock.length === limit) {
      return { products: inStock, total };
    }

    // Straddling the boundary: top the page up from the start of the tail.
    const tail = await this.prisma.product.findMany({
      where: outOfStockWhere,
      take: limit - inStock.length,
      orderBy,
      include,
    });
    return { products: [...inStock, ...tail], total };
  }

  /**
   * Bestselling page (TASK-164): rank the whole filtered candidate set by units
   * sold across PAID orders, then page in memory. Zero-sales products remain in
   * the list (newest-first tail) so the full catalogue stays browsable. `total`
   * is the filtered candidate count, so pagination metadata is unaffected by the
   * ranking.
   */
  private async findPageByBestselling(
    where: Prisma.ProductWhereInput,
    skip: number,
    limit: number,
  ): Promise<{ products: ProductWithBrand[]; total: number }> {
    const candidates = await this.prisma.product.findMany({
      where,
      select: { id: true, createdAt: true },
    });
    const unitsSold = await this.getUnitsSoldByProductId(candidates.map((c) => c.id));
    const rankedIds = rankProductIdsBySales(candidates, unitsSold);
    const pageIds = rankedIds.slice(skip, skip + limit);

    const rows = await this.prisma.product.findMany({
      where: { id: { in: pageIds } },
      include: { brand: { select: BRAND_SUMMARY_SELECT } },
    });
    const byId = new Map(rows.map((row) => [row.id, row]));
    const products = pageIds
      .map((id) => byId.get(id))
      .filter((product): product is ProductWithBrand => product != null);
    return { products, total: candidates.length };
  }

  /**
   * Sum sold quantity per product across PAID, non-deleted orders (TASK-164).
   * Restricted to the supplied candidate ids so the aggregate never scans the
   * whole order history. Products with no PAID sales are simply absent from the
   * returned map (treated as zero by the ranking).
   */
  private async getUnitsSoldByProductId(productIds: string[]): Promise<Map<string, number>> {
    if (productIds.length === 0) {
      return new Map();
    }
    const rows = await this.prisma.orderItem.groupBy({
      by: ['productId'],
      where: {
        productId: { in: productIds },
        order: { paymentStatus: PaymentStatus.PAID, deletedAt: null },
      },
      _sum: { quantity: true },
    });
    const map = new Map<string, number>();
    for (const row of rows) {
      map.set(row.productId, row._sum.quantity ?? 0);
    }
    return map;
  }

  /**
   * Reserved (still-held) quantity per product — Σ `OrderItem.quantity` across
   * orders whose status is in {@link PRE_SHIPMENT_STATUSES} (PENDING / CONFIRMED
   * / PROCESSING) and that are not soft-deleted (TASK-254). This is the derived
   * "units tied up in unshipped orders" figure the admin panel surfaces as
   * «Резерв»; `stock` already had these units subtracted at order creation, so
   * physical = stock + reserved.
   *
   * Sibling of {@link getUnitsSoldByProductId} — same empty-input short-circuit,
   * same "absent from the map ⇒ zero" contract. No `restockedAt` filter is
   * needed: a live pre-shipment order never carries `restockedAt` (only a
   * CANCELLED order can, and `revive` clears it back to null), so a revived
   * order counts identically to any other live one — exactly correct.
   */
  async getReservedQtyByProductId(productIds: string[]): Promise<Map<string, number>> {
    if (productIds.length === 0) {
      return new Map();
    }
    const rows = await this.prisma.orderItem.groupBy({
      by: ['productId'],
      where: {
        productId: { in: productIds },
        order: { status: { in: [...PRE_SHIPMENT_STATUSES] }, deletedAt: null },
      },
      _sum: { quantity: true },
    });
    const map = new Map<string, number>();
    for (const row of rows) {
      map.set(row.productId, row._sum.quantity ?? 0);
    }
    return map;
  }

  /**
   * Attach ratings, primary image and variant siblings to a page of products
   * (shared by every sort path). Runs the three lookups in one batched pass to
   * avoid N+1 queries.
   */
  private async enrichProducts(products: ProductWithBrand[]) {
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
   *
   * PUBLIC-ONLY (search results, the «Ви переглядали» rail), so products of a
   * DEACTIVATED category are dropped (TASK-297). This is also the backstop that
   * keeps a stale Meilisearch document — one whose category was withdrawn while
   * the engine was down — from ever rendering as a card.
   */
  async findByIdsForCards(ids: string[]): Promise<PaginatedProductsResult['products']> {
    if (ids.length === 0) {
      return [];
    }
    const products = await this.prisma.product.findMany({
      where: {
        id: { in: ids },
        isActive: true,
        deletedAt: null,
        category: { isActive: true },
      },
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
   * Resolve the ids of every active, non-deleted product filed DIRECTLY in any of
   * the given categories (TASK-291, plan 158 §3.13.2). The caller (the search
   * subtree-indexer) expands each moved category root into its full subtree first,
   * so a plain `categoryId IN (...)` is the correct membership test here.
   *
   * Inactive / soft-deleted products are excluded: they are not in the search index,
   * so re-indexing them would only issue a redundant delete.
   *
   * NOTE (TASK-297): the CATEGORY's own `isActive` is deliberately NOT filtered here.
   * These ids are the re-index WORK LIST, not a visibility query — when a category is
   * deactivated, it is precisely its still-active products that must be pushed through
   * `indexProduct` so `findOneForIndex` can resolve them to null and evict their
   * documents. Filtering them out here would leave them indexed forever.
   */
  async findIdsByCategoryIds(categoryIds: string[]): Promise<string[]> {
    if (categoryIds.length === 0) {
      return [];
    }

    const rows = await this.prisma.product.findMany({
      where: { categoryId: { in: categoryIds }, isActive: true, deletedAt: null },
      select: { id: true },
    });

    return rows.map((row) => row.id);
  }

  /**
   * Load a single active, non-deleted product as a search-index source
   * (TASK-075). Joins the category name + primary image so the built document is
   * self-contained. Returns null when the product is missing, soft-deleted,
   * deactivated, or filed in a DEACTIVATED category (TASK-297) — the search
   * service then removes it from the index instead.
   *
   * That null return IS the category-deactivation de-indexing mechanism: the
   * category status change re-indexes its subtree's products (`afterStatusChange`
   * → `CategorySubtreeIndexer`), each of which lands here, resolves to null, and
   * is deleted from the index. Re-activating the category re-indexes them the
   * same way. No separate de-index path exists — do not add one.
   */
  async findOneForIndex(id: string): Promise<ProductIndexSource | null> {
    const product = await this.prisma.product.findFirst({
      where: { id, isActive: true, deletedAt: null, category: { isActive: true } },
      include: {
        category: { select: { name: true } },
        brand: { select: { name: true } },
        images: {
          orderBy: [{ isPrimary: 'desc' }, { sortOrder: 'asc' }],
          take: 1,
          select: { url: true, blurDataUrl: true },
        },
        deviceCompat: { select: { deviceModelId: true } },
      },
    });
    return product ? this.toIndexSource(product) : null;
  }

  /**
   * Batch-pull active, non-deleted products as search-index sources (TASK-075
   * `reindexAll`). Ordered by `createdAt` for a stable pagination cursor.
   * Products of a deactivated category are excluded, so a full reindex rebuilds
   * exactly the on-sale catalogue (TASK-297) — same predicate as
   * {@link findOneForIndex}, which is what keeps incremental and full indexing
   * from disagreeing.
   */
  async findManyForIndex(skip: number, take: number): Promise<{ items: ProductIndexSource[] }> {
    const rows = await this.prisma.product.findMany({
      where: { isActive: true, deletedAt: null, category: { isActive: true } },
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
        deviceCompat: { select: { deviceModelId: true } },
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
      deviceCompat: Array<{ deviceModelId: string }>;
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
      deviceModelIds: product.deviceCompat.map((c) => c.deviceModelId),
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
        metaTitle: data.metaTitle ?? null,
        metaDescription: data.metaDescription ?? null,
      },
    });
  }

  /**
   * Update a product's fields.
   * Only the fields provided in the data object will be updated.
   * Returns the updated product record.
   *
   * When `slugRename` is present (a publicly-visible product's slug is
   * changing — gated by the service on the PRE-write `isActive`, plan 147
   * §Design Decision 3), the update and the slug-redirect chain-collapse
   * write commit in ONE transaction. When absent, the behavior is the
   * pre-TASK-285 single-statement update (no transaction on the hot,
   * no-rename path).
   */
  update(id: string, data: UpdateProductInput, slugRename?: SlugRenameInput): Promise<Product> {
    const { attributes, ...rest } = data;
    const updateData: Prisma.ProductUncheckedUpdateInput = {
      ...rest,
      ...(attributes !== undefined
        ? { attributes: (attributes ?? {}) as Prisma.InputJsonValue }
        : {}),
    };

    if (!slugRename) {
      return this.prisma.product.update({ where: { id }, data: updateData });
    }

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.product.update({ where: { id }, data: updateData });
      await this.slugRedirectRepository.recordRename(
        tx,
        SlugRedirectEntity.PRODUCT,
        slugRename.oldSlug,
        slugRename.newSlug,
      );
      return updated;
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
   * Bulk set `isActive` on exactly the named products (TASK-355).
   *
   * All-or-nothing, in one transaction: an id that does not exist — or that
   * points at a soft-deleted row, which `findMany` here excludes the same way
   * every other read does — aborts the whole batch rather than silently applying
   * the rest. A partial write would leave the operator's selection and the store
   * disagreeing with no indication of which half landed.
   *
   * Returns the updated rows (id, slug, isActive) because the service needs the
   * slug to evict each product's detail cache entry and the id to re-sync the
   * search index — the same side effects the per-row toggle performs.
   */
  async setActiveMany(
    ids: string[],
    isActive: boolean,
  ): Promise<Array<Pick<Product, 'id' | 'slug' | 'isActive'>>> {
    return this.prisma.$transaction(async (tx) => {
      const found = await tx.product.findMany({
        where: { id: { in: ids }, deletedAt: null },
        select: { id: true },
      });

      if (found.length !== ids.length) {
        const known = new Set(found.map((row) => row.id));
        throw new ProductsNotFoundError(ids.filter((id) => !known.has(id)));
      }

      await tx.product.updateMany({
        where: { id: { in: ids }, deletedAt: null },
        data: { isActive },
      });

      return tx.product.findMany({
        where: { id: { in: ids } },
        select: { id: true, slug: true, isActive: true },
      });
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
