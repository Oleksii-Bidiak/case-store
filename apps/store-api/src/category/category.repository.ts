import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma';
import { Category, Prisma, SlugRedirectEntity } from '@prisma/client';
import { SlugRedirectRepository } from '../slug-redirect';

/**
 * Hard recursion bound for the ordered ancestor-chain CTE (TASK-174). The
 * category tree is never anywhere near this deep in practice — the guard exists
 * purely so a (schema-permitted, cycle-detection-prevented, but not
 * DB-constrained) parent cycle can never spin the CTE forever.
 */
const MAX_CATEGORY_DEPTH = 50;

/**
 * Slugs of a rename being persisted by this update — when present, the write
 * additionally records a 301 redirect `oldSlug → newSlug` in the SlugRedirect
 * ledger, atomically with the category update (TASK-285-H). The service passes
 * it only when the category was publicly visible (active) before the write
 * (plan 147 §Design Decision 3).
 */
export interface SlugRenameInput {
  oldSlug: string;
  newSlug: string;
}

/**
 * Parameters for paginated category queries with filtering.
 */
export interface FindAllParams {
  page: number;
  limit: number;
  isActive?: boolean;
  parentId?: string;
  search?: string;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

/**
 * Parameters for paginated root category queries.
 * Root categories have parentId = null.
 */
export interface FindRootParams {
  page: number;
  limit: number;
  isActive?: boolean;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

/**
 * Allowed fields for creating a category.
 * Slug is optional — the service will auto-generate it from name if not provided.
 */
export interface CreateCategoryInput {
  name: string;
  slug?: string;
  description?: string | null;
  image?: string | null;
  parentId?: string | null;
  sortOrder?: number;
  isActive?: boolean;
  metaTitle?: string | null;
  metaDescription?: string | null;
}

/**
 * Allowed fields for updating a category.
 * Only provided fields will be updated.
 */
export interface UpdateCategoryInput {
  name?: string;
  slug?: string;
  description?: string | null;
  image?: string | null;
  parentId?: string | null;
  sortOrder?: number;
  isActive?: boolean;
  metaTitle?: string | null;
  metaDescription?: string | null;
}

/**
 * Result of a paginated category query.
 */
export interface PaginatedCategoriesResult {
  categories: Category[];
  total: number;
}

/**
 * Category with aggregated product count.
 * Used for admin listing endpoints.
 */
export interface CategoryWithCountResult {
  category: Category;
  productCount: number;
}

/**
 * Result of a paginated category query with product counts.
 */
export interface PaginatedCategoriesWithCountResult {
  categories: CategoryWithCountResult[];
  total: number;
}

@Injectable()
export class CategoryRepository {
  private readonly logger = new Logger(CategoryRepository.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly slugRedirectRepository: SlugRedirectRepository,
  ) {}

  /**
   * Find a category by ID.
   * Returns the category record or null if not found.
   */
  findById(id: string): Promise<Category | null> {
    return this.prisma.category.findUnique({ where: { id } });
  }

  /**
   * Find a category by slug.
   * Returns the category record or null if not found.
   */
  findBySlug(slug: string): Promise<Category | null> {
    return this.prisma.category.findUnique({ where: { slug } });
  }

  /**
   * Find root categories (parentId = null) with pagination.
   * Root categories are top-level categories in the hierarchy.
   */
  async findRootCategories(params: FindRootParams): Promise<PaginatedCategoriesResult> {
    const { page, limit, isActive, sortBy = 'sortOrder', sortOrder = 'asc' } = params;
    const skip = (page - 1) * limit;

    const where: Prisma.CategoryWhereInput = {
      parentId: null,
      ...(isActive !== undefined && { isActive }),
    };

    // Validate and map sort field
    const allowedSortFields: Record<string, string> = {
      name: 'name',
      sortOrder: 'sortOrder',
      createdAt: 'createdAt',
    };
    const sortField = allowedSortFields[sortBy];
    if (!sortField) {
      this.logger.warn(`Invalid sort field: ${sortBy}, falling back to sortOrder`);
    }
    const effectiveSortField = sortField ?? 'sortOrder';

    const [categories, total] = await Promise.all([
      this.prisma.category.findMany({
        where,
        skip,
        take: limit,
        orderBy: { [effectiveSortField]: sortOrder },
      }),
      this.prisma.category.count({ where }),
    ]);

    return { categories, total };
  }

  /**
   * Find all categories with pagination and optional filtering.
   * Supports filtering by active status, parent, and text search.
   */
  async findAll(params: FindAllParams): Promise<PaginatedCategoriesResult> {
    const {
      page,
      limit,
      isActive,
      parentId,
      search,
      sortBy = 'sortOrder',
      sortOrder = 'asc',
    } = params;
    const skip = (page - 1) * limit;

    // Build the where clause from optional filters
    const where: Prisma.CategoryWhereInput = {};

    if (isActive !== undefined) {
      where.isActive = isActive;
    }

    if (parentId !== undefined) {
      where.parentId = parentId;
    }

    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { description: { contains: search, mode: 'insensitive' } },
      ];
    }

    // Validate and map sort field
    const allowedSortFields: Record<string, string> = {
      name: 'name',
      sortOrder: 'sortOrder',
      createdAt: 'createdAt',
    };
    const sortField = allowedSortFields[sortBy];
    if (!sortField) {
      this.logger.warn(`Invalid sort field: ${sortBy}, falling back to sortOrder`);
    }
    const effectiveSortField = sortField ?? 'sortOrder';

    const [categories, total] = await Promise.all([
      this.prisma.category.findMany({
        where,
        skip,
        take: limit,
        orderBy: { [effectiveSortField]: sortOrder },
      }),
      this.prisma.category.count({ where }),
    ]);

    return { categories, total };
  }

  /**
   * Find the full category tree with nested children.
   * Returns root categories with recursively loaded children.
   * Uses Prisma's include for 3 levels of nesting (sufficient for
   * most mobile accessory catalogs).
   */
  async findCategoryTree(): Promise<
    Array<
      Category & {
        children: Array<
          Category & {
            children: Array<Category & { children: Category[] }>;
          }
        >;
      }
    >
  > {
    // Fetch root categories with 3 levels of nested children
    return this.prisma.category.findMany({
      where: { parentId: null, isActive: true },
      orderBy: { sortOrder: 'asc' },
      include: {
        children: {
          where: { isActive: true },
          orderBy: { sortOrder: 'asc' },
          include: {
            children: {
              where: { isActive: true },
              orderBy: { sortOrder: 'asc' },
              include: {
                children: {
                  where: { isActive: true },
                  orderBy: { sortOrder: 'asc' },
                },
              },
            },
          },
        },
      },
    });
  }

  /**
   * Admin variant of {@link findCategoryTree} (TASK-236): the FULL tree with
   * every `isActive` state, still capped at 3 nested levels. Backs
   * `GET /categories/admin/tree` so staff can assign a product to a temporarily
   * deactivated leaf without it silently vanishing from the picker. Mirrors
   * `findCategoryTree` exactly minus the `isActive: true` filters.
   */
  async findCategoryTreeForAdmin(): Promise<
    Array<
      Category & {
        children: Array<
          Category & {
            children: Array<Category & { children: Category[] }>;
          }
        >;
      }
    >
  > {
    return this.prisma.category.findMany({
      where: { parentId: null },
      orderBy: { sortOrder: 'asc' },
      include: {
        children: {
          orderBy: { sortOrder: 'asc' },
          include: {
            children: {
              orderBy: { sortOrder: 'asc' },
              include: {
                children: {
                  orderBy: { sortOrder: 'asc' },
                },
              },
            },
          },
        },
      },
    });
  }

  /**
   * Find a category by ID with its product count.
   * Returns the category record and the count of active products.
   */
  async findWithProductCount(id: string): Promise<CategoryWithCountResult | null> {
    const category = await this.prisma.category.findUnique({
      where: { id },
    });

    if (!category) {
      return null;
    }

    const productCount = await this.prisma.product.count({
      where: { categoryId: id, isActive: true },
    });

    return { category, productCount };
  }

  /**
   * Find all categories with their product counts (admin listing).
   * Supports pagination and optional filtering.
   */
  async findAllWithProductCount(
    params: FindAllParams,
  ): Promise<PaginatedCategoriesWithCountResult> {
    const {
      page,
      limit,
      isActive,
      parentId,
      search,
      sortBy = 'sortOrder',
      sortOrder = 'asc',
    } = params;
    const skip = (page - 1) * limit;

    // Build the where clause from optional filters
    const where: Prisma.CategoryWhereInput = {};

    if (isActive !== undefined) {
      where.isActive = isActive;
    }

    if (parentId !== undefined) {
      where.parentId = parentId;
    }

    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { description: { contains: search, mode: 'insensitive' } },
      ];
    }

    // Validate and map sort field
    const allowedSortFields: Record<string, string> = {
      name: 'name',
      sortOrder: 'sortOrder',
      createdAt: 'createdAt',
    };
    const sortField = allowedSortFields[sortBy];
    if (!sortField) {
      this.logger.warn(`Invalid sort field: ${sortBy}, falling back to sortOrder`);
    }
    const effectiveSortField = sortField ?? 'sortOrder';

    const [categories, total] = await Promise.all([
      this.prisma.category.findMany({
        where,
        skip,
        take: limit,
        orderBy: { [effectiveSortField]: sortOrder },
        include: {
          _count: {
            select: {
              products: { where: { isActive: true } },
            },
          },
        },
      }),
      this.prisma.category.count({ where }),
    ]);

    const categoriesWithCount: CategoryWithCountResult[] = categories.map((cat) => ({
      category: {
        id: cat.id,
        name: cat.name,
        slug: cat.slug,
        description: cat.description,
        image: cat.image,
        parentId: cat.parentId,
        isActive: cat.isActive,
        sortOrder: cat.sortOrder,
        createdAt: cat.createdAt,
        updatedAt: cat.updatedAt,
      } as Category,
      productCount: cat._count.products,
    }));

    return { categories: categoriesWithCount, total };
  }

  /**
   * Create a new category.
   * Returns the created category record.
   */
  create(data: CreateCategoryInput & { slug: string }): Promise<Category> {
    return this.prisma.category.create({
      data: {
        name: data.name,
        slug: data.slug,
        description: data.description ?? null,
        image: data.image ?? null,
        parentId: data.parentId ?? null,
        sortOrder: data.sortOrder ?? 0,
        isActive: data.isActive ?? true,
        metaTitle: data.metaTitle ?? null,
        metaDescription: data.metaDescription ?? null,
      },
    });
  }

  /**
   * Update a category's fields.
   * Only the fields provided in the data object will be updated.
   * Returns the updated category record.
   *
   * When `slugRename` is present (a publicly-visible category's slug is
   * changing — gated by the service on the PRE-write `isActive`, plan 147
   * §Design Decision 3), the update and the slug-redirect chain-collapse
   * write commit in ONE transaction. When absent, the behavior is the
   * pre-TASK-285 single-statement update (no transaction on the hot,
   * no-rename path).
   */
  update(id: string, data: UpdateCategoryInput, slugRename?: SlugRenameInput): Promise<Category> {
    if (!slugRename) {
      return this.prisma.category.update({
        where: { id },
        data,
      });
    }

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.category.update({ where: { id }, data });
      await this.slugRedirectRepository.recordRename(
        tx,
        SlugRedirectEntity.CATEGORY,
        slugRename.oldSlug,
        slugRename.newSlug,
      );
      return updated;
    });
  }

  /**
   * Deactivate a category by setting isActive = false.
   * Returns the updated category record.
   */
  deactivate(id: string): Promise<Category> {
    return this.prisma.category.update({
      where: { id },
      data: { isActive: false },
    });
  }

  /**
   * Activate a category by setting isActive = true.
   * Returns the updated category record.
   */
  activate(id: string): Promise<Category> {
    return this.prisma.category.update({
      where: { id },
      data: { isActive: true },
    });
  }

  /**
   * Find direct children of a category.
   * Returns categories whose parentId matches the given ID.
   */
  findChildren(parentId: string): Promise<Category[]> {
    return this.prisma.category.findMany({
      where: { parentId },
      orderBy: { sortOrder: 'asc' },
    });
  }

  /**
   * Find all descendant IDs of a category (for cycle detection).
   * Uses a PostgreSQL recursive CTE to fetch all descendants
   * in a single query instead of N+1 BFS traversal.
   * Returns an array of all descendant category IDs.
   */
  async findDescendantIds(categoryId: string): Promise<string[]> {
    const result = await this.prisma.$queryRaw<Array<{ id: string }>>`
      WITH RECURSIVE descendants AS (
        -- Base case: direct children of the category
        SELECT id FROM categories WHERE parent_id = ${categoryId}
        UNION
        -- Recursive case: children of children
        SELECT c.id FROM categories c
        INNER JOIN descendants d ON c.parent_id = d.id
      )
      SELECT id FROM descendants
    `;

    return result.map((row) => row.id);
  }

  /**
   * Resolve the full subtree of a category — the category itself plus every
   * descendant id, at any depth (TASK-236). Backs the product-listing rollup so
   * filtering by a parent category returns products filed in its subcategories.
   *
   * Implemented as a single PostgreSQL recursive CTE over `categories(id,
   * parent_id)` — correct at any depth and independent of the active-tree cache,
   * so an inactive leaf still resolves. The self id is ALWAYS present in the
   * result (even for a non-existent `categoryId`, where the CTE's base row is
   * empty) so callers get a well-formed, non-empty `IN (...)` filter. Ordering
   * is not guaranteed — callers only need set membership.
   */
  async findSubtreeIds(categoryId: string): Promise<string[]> {
    const result = await this.prisma.$queryRaw<Array<{ id: string }>>`
      WITH RECURSIVE subtree AS (
        -- Base case: the category itself
        SELECT id, parent_id FROM categories WHERE id = ${categoryId}
        UNION
        -- Recursive case: children of nodes already in the subtree
        SELECT c.id, c.parent_id FROM categories c
        INNER JOIN subtree s ON c.parent_id = s.id
      )
      SELECT id FROM subtree
    `;

    const ids = new Set(result.map((row) => row.id));
    ids.add(categoryId);
    return [...ids];
  }

  /**
   * Resolve the ancestor chain of a category — the category itself plus every
   * ancestor id up to the root (TASK-236). Used to build the per-document
   * `categoryIds[]` array for the Meilisearch rollup (and, later, plan 112
   * attribute-definition inheritance).
   *
   * Single PostgreSQL recursive CTE walking `parent_id` upward. Returns
   * `[categoryId]` for a root category (no parent) and, like {@link
   * findSubtreeIds}, always includes the self id even for a non-existent
   * `categoryId`. Ordering is not guaranteed.
   */
  async findAncestorIds(categoryId: string): Promise<string[]> {
    const result = await this.prisma.$queryRaw<Array<{ id: string }>>`
      WITH RECURSIVE ancestors AS (
        -- Base case: the category itself
        SELECT id, parent_id FROM categories WHERE id = ${categoryId}
        UNION
        -- Recursive case: the parent of nodes already in the chain
        SELECT c.id, c.parent_id FROM categories c
        INNER JOIN ancestors a ON a.parent_id = c.id
      )
      SELECT id FROM ancestors
    `;

    const ids = new Set(result.map((row) => row.id));
    ids.add(categoryId);
    return [...ids];
  }

  /**
   * Resolve the ancestor chain of a category ORDERED nearest-first — the
   * category itself at index 0, then its parent, then its grandparent, up to
   * the root (TASK-174). Same recursive CTE shape as {@link findAncestorIds},
   * extended with a `depth` column so callers that implement
   * "nearest-ancestor-wins" (the add-on applicability resolver) get the chain in
   * priority order without an extra per-row round trip.
   *
   * Cycle safety: unlike `findAncestorIds`' `UNION` (which de-duplicates and so
   * terminates on its own), the `depth` column makes every revisit of a cycled
   * row distinct, so `UNION ALL` alone would never terminate — a hard
   * `depth < MAX_CATEGORY_DEPTH` guard bounds the recursion instead. A JS-side
   * de-duplication keeps the first (nearest) occurrence of each id.
   *
   * Like {@link findAncestorIds}, the self id is ALWAYS present, even for a
   * non-existent `categoryId` (which resolves to `[categoryId]`).
   */
  async findAncestorChainOrdered(categoryId: string): Promise<string[]> {
    const chains = await this.findAncestorChainsOrdered([categoryId]);
    return chains.get(categoryId) ?? [categoryId];
  }

  /**
   * Batched form of {@link findAncestorChainOrdered} — resolves the ordered
   * ancestor chain for MANY categories in a SINGLE recursive CTE, partitioned by
   * the base row each branch started from (TASK-174). Backs
   * `AddonApplicabilityResolver.resolveForProducts`' no-N+1 requirement: a cart
   * with N lines spanning M distinct categories costs one query, not M.
   *
   * Every requested id is present in the returned map (a non-existent id maps to
   * `[id]`, matching the single-id contract). Duplicate input ids are collapsed.
   */
  async findAncestorChainsOrdered(categoryIds: string[]): Promise<Map<string, string[]>> {
    const distinctIds = [...new Set(categoryIds)];
    const chains = new Map<string, string[]>(distinctIds.map((id) => [id, [id]]));
    if (distinctIds.length === 0) return chains;

    const rows = await this.prisma.$queryRaw<
      Array<{ start_id: string; id: string; depth: number }>
    >`
      WITH RECURSIVE chains AS (
        -- Base case: each requested category itself, at depth 0
        SELECT c.id AS start_id, c.id, c.parent_id, 0 AS depth
        FROM categories c
        WHERE c.id IN (${Prisma.join(distinctIds)})
        UNION ALL
        -- Recursive case: the parent of nodes already in the chain, one level up
        SELECT ch.start_id, c.id, c.parent_id, ch.depth + 1
        FROM categories c
        INNER JOIN chains ch ON ch.parent_id = c.id
        WHERE ch.depth < ${MAX_CATEGORY_DEPTH}
      )
      SELECT start_id, id, depth FROM chains
      ORDER BY start_id, depth ASC
    `;

    for (const row of rows) {
      const chain = chains.get(row.start_id);
      if (!chain) continue;
      // depth 0 is the self id, already seeded above.
      if (row.depth === 0 || chain.includes(row.id)) continue;
      chain.push(row.id);
    }

    return chains;
  }
}
