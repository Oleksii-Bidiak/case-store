import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma';
import { Product, Prisma } from '@prisma/client';

/**
 * Parameters for paginated product queries with filtering.
 */
export interface FindAllParams {
  page: number;
  limit: number;
  categoryId?: string;
  isActive?: boolean;
  minPrice?: number;
  maxPrice?: number;
  search?: string;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

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
 * Primary image shape attached to list rows (and used by the detail include).
 */
export interface PrimaryImage {
  id: string;
  url: string;
  alt: string | null;
  sortOrder: number;
  isPrimary: boolean;
}

/**
 * Result of a paginated product query. Each product is enriched with its
 * approved-review aggregate (for star ratings) and its primary image (for cards).
 */
export interface PaginatedProductsResult {
  products: (Product & ProductRating & { primaryImage: PrimaryImage | null })[];
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
      group: ProductGroupRelation | null;
      images: Array<{
        id: string;
        url: string;
        alt: string | null;
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
  findById(id: string): Promise<Product | null> {
    return this.prisma.product.findFirst({ where: { id, deletedAt: null } });
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
      categoryId,
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

    if (categoryId !== undefined) {
      where.categoryId = categoryId;
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
      }),
      this.prisma.product.count({ where }),
    ]);

    const productIds = products.map((p) => p.id);
    const [ratings, primaryImages] = await Promise.all([
      this.getRatingsByProductId(productIds),
      this.getPrimaryImagesByProductId(productIds),
    ]);
    const enriched = products.map((product) => {
      const rating = ratings.get(product.id);
      return {
        ...product,
        ratingAverage: rating?.ratingAverage ?? null,
        ratingCount: rating?.ratingCount ?? 0,
        primaryImage: primaryImages.get(product.id) ?? null,
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
