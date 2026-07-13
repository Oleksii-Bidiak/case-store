import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import {
  CategoryRepository,
  CategoryUpdateResult,
  CreateCategoryInput,
  UpdateCategoryInput,
  FindRootParams,
  FindAllParams,
} from './category.repository';
import {
  AdminCategoryTreeNodeEntity,
  CategoryEntity,
  CategoryTreeNodeEntity,
  CategoryWithCountEntity,
} from './entities';
import { CategoryListQueryDto } from './dto';
import {
  CategoryDomainError,
  CategoryErrorCode,
  badCategory,
  conflictCategory,
  notFoundCategory,
} from './category.errors';
import { ReorderGroupInput } from './category-reorder.rules';
import { generateSlug } from '../common/utils';
import { CacheService, PRODUCT_LIST_PREFIX } from '../cache';
import { CategorySubtreeIndexer } from '../common/ports/category-subtree-indexer.port';

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
 * Paginated response envelope for category lists.
 */
interface PaginatedCategoriesResponse {
  data: CategoryEntity[];
  meta: PaginationMeta;
}

/**
 * Paginated response envelope for categories with product counts.
 */
interface PaginatedCategoriesWithCountResponse {
  data: CategoryWithCountEntity[];
  meta: PaginationMeta;
}

/**
 * Category tree response for navigation.
 */
interface CategoryTreeResponse {
  data: CategoryTreeNodeEntity[];
}

/**
 * Admin category tree response (TASK-291) — same envelope, richer nodes.
 */
interface AdminCategoryTreeResponse {
  data: AdminCategoryTreeNodeEntity[];
}

/**
 * Category detail response with product count.
 */
interface CategoryWithCountResponse {
  data: CategoryWithCountEntity;
  productCount: number;
}

/**
 * Batch reorder/reparent payload (TASK-291). Structural on purpose: `ReorderTreeDto`
 * (class-validator, added in TASK-291-E) satisfies it, so the service does not depend
 * on the DTO's shape beyond the one field it forwards.
 */
export interface ReorderTreeInput {
  groups: ReorderGroupInput[];
}

@Injectable()
export class CategoryService {
  constructor(
    private readonly categoryRepository: CategoryRepository,
    private readonly cache: CacheService,
    private readonly categorySubtreeIndexer: CategorySubtreeIndexer,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(CategoryService.name);
  }

  /**
   * Get a paginated list of root categories (parentId = null).
   * Public endpoint — used for storefront category browsing.
   */
  async getRootCategories(query: CategoryListQueryDto): Promise<PaginatedCategoriesResponse> {
    const params: FindRootParams = {
      page: query.page ?? 1,
      limit: query.limit ?? 20,
      isActive: query.isActive,
      sortBy: query.sortBy ?? 'sortOrder',
      sortOrder: query.sortOrder ?? 'asc',
    };

    const { categories, total } = await this.categoryRepository.findRootCategories(params);
    const totalPages = Math.ceil(total / params.limit);

    return {
      data: categories.map((category) => CategoryEntity.fromPrisma(category)),
      meta: {
        total,
        page: params.page,
        limit: params.limit,
        totalPages,
      },
    };
  }

  /**
   * Get the full category tree for navigation.
   * Public endpoint — returns nested categories for menus/breadcrumbs.
   */
  async getCategoryTree(): Promise<CategoryTreeResponse> {
    const tree = await this.categoryRepository.findCategoryTree();

    return {
      data: tree.map((node) => CategoryTreeNodeEntity.fromPrisma(node)),
    };
  }

  /**
   * Get the FULL category tree for admin tooling (TASK-236, rewritten by TASK-291)
   * — all `isActive` states and, since the read became a flat query (plan 158
   * §3.3), no structural depth cap either. The repository already returns
   * {@link AdminCategoryTreeNodeEntity} nodes (a strict superset of
   * {@link CategoryTreeNodeEntity}: `parentId`, `productCount`, `depth`), so this is
   * a pass-through — there is nothing left to map.
   */
  async getCategoryTreeForAdmin(): Promise<AdminCategoryTreeResponse> {
    const data = await this.categoryRepository.findCategoryTreeForAdmin();

    return { data };
  }

  /**
   * Get a category by slug with its product count.
   * Public endpoint — used for category detail pages.
   * Throws NotFoundException if the category is not found.
   */
  async findBySlug(slug: string): Promise<CategoryWithCountResponse> {
    const category = await this.categoryRepository.findBySlug(slug);

    if (!category) {
      throw new NotFoundException('Category not found');
    }

    const result = await this.categoryRepository.findWithProductCount(category.id);

    if (!result) {
      throw new NotFoundException('Category not found');
    }

    return {
      data: CategoryWithCountEntity.fromPrisma(result.category, result.productCount),
      productCount: result.productCount,
    };
  }

  /**
   * Get a category by ID (admin-only).
   * Throws NotFoundException if the category is not found.
   */
  async findById(id: string): Promise<CategoryEntity> {
    const category = await this.categoryRepository.findById(id);

    if (!category) {
      throw new NotFoundException('Category not found');
    }

    return CategoryEntity.fromPrisma(category);
  }

  /**
   * Create a new category (admin-only).
   * Validates slug uniqueness and parent existence before creating.
   * Auto-generates slug from name if not provided.
   * Throws ConflictException if slug is already taken.
   * Throws NotFoundException if parentId does not exist.
   */
  async create(input: CreateCategoryInput): Promise<CategoryEntity> {
    // Auto-generate slug from name if not provided
    const slug = input.slug ?? generateSlug(input.name);

    // Check slug uniqueness
    const existingBySlug = await this.categoryRepository.findBySlug(slug);
    if (existingBySlug) {
      throw new ConflictException('A category with this slug already exists');
    }

    // Validate parent category exists if parentId is provided
    if (input.parentId) {
      const parent = await this.categoryRepository.findById(input.parentId);
      if (!parent) {
        throw new NotFoundException('Parent category not found');
      }
    }

    const category = await this.categoryRepository.create({
      ...input,
      slug,
    });

    return CategoryEntity.fromPrisma(category);
  }

  /**
   * Update a category (admin-only).
   * Validates slug uniqueness if it is being changed.
   * Validates parent existence if parentId is being changed.
   * Detects circular references if parentId is being changed.
   * Throws NotFoundException if the category is not found.
   * Throws ConflictException if the new slug is already taken.
   * Throws BadRequestException if setting parent to a descendant (cycle).
   */
  async update(id: string, input: UpdateCategoryInput): Promise<CategoryEntity> {
    // Verify the category exists
    const category = await this.categoryRepository.findById(id);

    if (!category) {
      throw new NotFoundException('Category not found');
    }

    // If slug is being changed, check uniqueness
    if (input.slug !== undefined && input.slug !== category.slug) {
      const existingBySlug = await this.categoryRepository.findBySlug(input.slug);
      if (existingBySlug && existingBySlug.id !== id) {
        throw new ConflictException('A category with this slug already exists');
      }
    }

    // If parentId is being changed, validate the new parent. These are FAST-FAIL guards
    // on a pre-lock read; the repository re-runs the authoritative self-parent / cycle /
    // depth checks against an in-transaction snapshot under the tree advisory lock
    // (plan 158 §3.10.4) and throws the same domain errors, which `toHttp` maps below.
    // NOTE: this comparison is NON-authoritative and is used for NOTHING but these
    // fast-fail guards — a concurrent reparent can make it disagree with what actually
    // happens under the lock, so the side effects below key off the repository's
    // in-transaction `reparented` flag instead.
    if (input.parentId !== undefined && input.parentId !== category.parentId) {
      // A category can never be its own parent (pre-existing hole, plan §2.1).
      if (input.parentId === id) {
        throw badCategory(CategoryErrorCode.SELF_PARENT, 'A category cannot be its own parent');
      }

      // Setting to null (making it a root category) is always valid
      if (input.parentId !== null) {
        // Validate parent exists
        const parent = await this.categoryRepository.findById(input.parentId);
        if (!parent) {
          throw new NotFoundException('Parent category not found');
        }

        // Detect cycles: cannot set parent to one of our own descendants
        const descendantIds = await this.categoryRepository.findDescendantIds(id);
        if (descendantIds.includes(input.parentId)) {
          throw badCategory(
            CategoryErrorCode.CYCLE,
            'Cannot set parent to a descendant category (circular reference)',
          );
        }
      }
    }

    // Record a 301 redirect only when the category was publicly visible
    // (active) immediately BEFORE this write and the slug is actually changing
    // (plan 147 §Design Decision 3). The PRE-write snapshot matters: a single
    // call may rename the slug AND deactivate the category — the old URL was
    // reachable until now, so the redirect is still recorded.
    const wasActive = category.isActive;
    const slugRename =
      wasActive && input.slug !== undefined && input.slug !== category.slug
        ? { oldSlug: category.slug, newSlug: input.slug }
        : undefined;

    let result: CategoryUpdateResult;
    try {
      result = await this.categoryRepository.update(id, input, slugRename);
    } catch (error) {
      throw this.toHttp(error);
    }

    if (result.reparented) {
      // Same post-commit side effects as the batch endpoint (plan §3.13) — a reparent
      // changes subtree membership, which is baked into BOTH the category-filtered
      // product-list cache key rollup and the products' indexed ancestor chains. Both
      // were pre-existing holes on this path (§2.1).
      //
      // The gate is the repository's AUTHORITATIVE, tree-locked verdict — NOT the
      // pre-transaction `input.parentId !== category.parentId` comparison above. Those
      // two disagree whenever another admin reparents this node between our unlocked read
      // and the lock: a full-object PUT re-sending the (now stale) parent would then look
      // like "no change" here while the repository legitimately moves the node back — and
      // the cache/index would silently rot. `movedIds` does the same job for the batch
      // endpoint; this is its single-node twin.
      await this.cache.delByPrefix(PRODUCT_LIST_PREFIX);
      this.reindexSubtreesInBackground([id]);
    }

    return CategoryEntity.fromPrisma(result.category);
  }

  /**
   * Apply a batch of sibling-bucket rewrites (reorder and/or reparent) and return the
   * refreshed admin tree (TASK-291, plan 158 §3.13).
   *
   * ONE repository call = ONE transaction (never one per group). All side effects fire
   * exactly once, AFTER it commits: the product-list cache eviction (a reparent changes
   * the subtree rollup baked into its key), a best-effort NON-BLOCKING search re-index of
   * the moved subtrees (a Meilisearch outage must never fail an admin request), and one
   * structured audit line.
   *
   * The repository's domain errors are mapped to HTTP here — the wire body carries the
   * stable `error` code the admin panel keys its UA announcements off.
   */
  async reorderTree(dto: ReorderTreeInput, actorId?: string): Promise<AdminCategoryTreeResponse> {
    let result;
    try {
      result = await this.categoryRepository.applyTreeMoves(dto.groups);
    } catch (error) {
      throw this.toHttp(error);
    }

    await this.cache.delByPrefix(PRODUCT_LIST_PREFIX);
    this.reindexSubtreesInBackground(result.movedIds);

    this.logger.info(
      {
        event: 'category.reorder',
        groups: dto.groups,
        movedIds: result.movedIds,
        actorId,
      },
      'Category tree reordered',
    );

    return { data: result.tree };
  }

  /**
   * Fire the subtree re-index WITHOUT awaiting it: the index is eventually consistent and
   * the reindex endpoint repairs any drift, so an indexing failure may neither delay nor
   * fail the admin write. The port is best-effort by contract; the `catch` is belt-and-
   * braces against an unhandled rejection from a faulty implementation.
   */
  private reindexSubtreesInBackground(rootCategoryIds: string[]): void {
    void this.categorySubtreeIndexer.reindexSubtrees(rootCategoryIds).catch((err: unknown) => {
      this.logger.warn({ err, rootCategoryIds }, 'Best-effort category subtree reindex failed');
    });
  }

  /**
   * Map a category domain error onto its HTTP status (plan 158 §3.5 / §6). Anything that
   * is not a domain error (a Prisma failure, a lost connection) is rethrown untouched so
   * the global filter still reports it as a 500.
   */
  private toHttp(error: unknown): Error {
    if (!(error instanceof CategoryDomainError)) {
      return error instanceof Error ? error : new Error(String(error));
    }

    switch (error.code) {
      case CategoryErrorCode.NOT_FOUND:
        return notFoundCategory(error.code, error.message);
      case CategoryErrorCode.TREE_STALE:
        return conflictCategory(error.code, error.message);
      default:
        return badCategory(error.code, error.message);
    }
  }

  /**
   * Set `isActive` on many categories in one transaction (TASK-293), and return the
   * refreshed admin tree so the panel resyncs from a single round-trip — the same contract
   * as {@link reorderTree}.
   *
   * NO CASCADE (owner decision): exactly the named rows change. To switch a whole branch
   * off, the operator selects the whole branch.
   */
  async setStatusMany(
    ids: string[],
    isActive: boolean,
    actorId?: string,
  ): Promise<AdminCategoryTreeResponse> {
    let result;
    try {
      result = await this.categoryRepository.setActiveMany(ids, isActive);
    } catch (error) {
      throw this.toHttp(error);
    }

    await this.afterStatusChange(ids, isActive, actorId, result.updatedCount);

    return { data: result.tree };
  }

  /**
   * Deactivate a category by setting isActive = false (admin-only).
   * Throws NotFoundException if the category is not found.
   */
  async deactivate(id: string, actorId?: string): Promise<CategoryEntity> {
    const category = await this.categoryRepository.findById(id);

    if (!category) {
      throw new NotFoundException('Category not found');
    }

    const deactivatedCategory = await this.categoryRepository.deactivate(id);
    await this.afterStatusChange([id], false, actorId, 1);

    return CategoryEntity.fromPrisma(deactivatedCategory);
  }

  /**
   * Activate a category by setting isActive = true (admin-only).
   * Throws NotFoundException if the category is not found.
   */
  async activate(id: string, actorId?: string): Promise<CategoryEntity> {
    const category = await this.categoryRepository.findById(id);

    if (!category) {
      throw new NotFoundException('Category not found');
    }

    const activatedCategory = await this.categoryRepository.activate(id);
    await this.afterStatusChange([id], true, actorId, 1);

    return CategoryEntity.fromPrisma(activatedCategory);
  }

  /**
   * The post-commit side effects of a status change — shared by the per-row toggles and
   * the bulk endpoint (TASK-293).
   *
   * Until TASK-293 the per-row toggles did NONE of this: flipping a category off left the
   * cached product lists advertising it, left its products indexed under it in Meili, and
   * left no trace in the log. `reorderTree` already did all three; a status change is just
   * as visible to shoppers, so it now does the same.
   */
  private async afterStatusChange(
    ids: string[],
    isActive: boolean,
    actorId: string | undefined,
    updatedCount: number,
  ): Promise<void> {
    await this.cache.delByPrefix(PRODUCT_LIST_PREFIX);
    this.reindexSubtreesInBackground(ids);

    this.logger.info(
      { event: 'category.status', ids, isActive, updatedCount, actorId },
      isActive ? 'Categories activated' : 'Categories deactivated',
    );
  }

  /**
   * Get all categories with their product counts (admin-only).
   * Supports pagination and filtering.
   */
  async findAllWithProductCount(
    query: CategoryListQueryDto,
  ): Promise<PaginatedCategoriesWithCountResponse> {
    const params: FindAllParams = {
      page: query.page ?? 1,
      limit: query.limit ?? 20,
      isActive: query.isActive,
      parentId: query.parentId,
      search: query.search,
      sortBy: query.sortBy ?? 'sortOrder',
      sortOrder: query.sortOrder ?? 'asc',
    };

    const { categories, total } = await this.categoryRepository.findAllWithProductCount(params);
    const totalPages = Math.ceil(total / params.limit);

    return {
      data: categories.map((item) =>
        CategoryWithCountEntity.fromPrisma(item.category, item.productCount),
      ),
      meta: {
        total,
        page: params.page,
        limit: params.limit,
        totalPages,
      },
    };
  }
}
