import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma';
import { Category, Prisma, SlugRedirectEntity } from '@prisma/client';
import { SlugRedirectRepository } from '../slug-redirect';
// eslint-disable-next-line local/no-deep-module-import -- cycle: product barrel > product.module > category barrel > this file
import { PUBLIC_PRODUCT_WHERE } from '../product/product-visibility';
import { AdminCategoryTreeNodeEntity, AdminCategoryTreeRow } from './entities';
import {
  CategorySnapshotRow,
  ReorderGroupInput,
  ResolvedWrite,
  assertMoveDepth,
  validateAndResolveReorder,
} from './category-reorder.rules';
import {
  CategoryCycleError,
  CategoryMoveTargetInSubtreeError,
  CategoryMoveTargetNotFoundError,
  CategoryMoveTargetRequiredError,
  CategoryNotFoundError,
  CategorySelfParentError,
  CategorySlugConflictError,
  CategoryTreeStaleError,
} from './category.errors';
import {
  acquireAdvisoryLocks,
  applySortOrderWrites,
  lockKey,
  treeLockKey,
} from '../common/reorder';

/**
 * Any Prisma client the read helpers accept: the injected singleton or an
 * interactive-transaction client. Passing the `tx` client is what lets a guard see
 * the batch's OWN uncommitted moves (plan 158 §3.7 step 3).
 */
export type CategoryDbClient = PrismaService | Prisma.TransactionClient;

/**
 * Hard recursion bound for the ordered ancestor-chain CTE (TASK-174). The
 * category tree is never anywhere near this deep in practice — the guard exists
 * purely so a (schema-permitted, cycle-detection-prevented, but not
 * DB-constrained) parent cycle can never spin the CTE forever.
 */
const MAX_CATEGORY_DEPTH = 50;

/**
 * Advisory-lock resource namespace (plan 158 §3.8). The key helpers themselves live in
 * `common/reorder/sibling-order.util.ts` so the flat sortable admins (banners /
 * blog-categories / device-brands) reuse the exact same recipe: advisory locks are
 * DATABASE-GLOBAL and every resource has a `__root__` bucket, so without the resource
 * prefix a banner reorder would serialise against a root-category reorder.
 */
const LOCK_RESOURCE = 'categories';

/**
 * The TREE-SCOPED lock key. Taken by ANY write that changes a node's `parentId`
 * (`applyTreeMoves` with at least one reparent, and `update`'s parent-change path).
 *
 * Non-negotiable (§3.8): cycle and depth are WHOLE-TREE invariants and per-bucket locks
 * do not serialise the operations that violate them — admin A moving X under Y locks
 * `{oldParent(X), Y}` while admin B moving Y under X locks `{oldParent(Y), X}`, DISJOINT
 * sets; at READ COMMITTED both snapshot before the other commits, both guards see only
 * committed rows, and an `X → Y → X` cycle lands in the table (textbook write skew).
 */
const TREE_LOCK_KEY = treeLockKey(LOCK_RESOURCE);

/** Per-bucket lock key. `null` (the root bucket) has no row to lock — hence the sentinel. */
const bucketLockKey = (parentId: string | null): string => lockKey(LOCK_RESOURCE, parentId);

/**
 * Thrown internally when a batch that LOOKED like a pure same-parent reorder turns out —
 * once its bucket locks are held and the authoritative snapshot is read — to actually
 * reparent something (another admin moved a node in the meantime). Upgrading the lock in
 * place would acquire the tree key out of order and could deadlock, so the transaction is
 * aborted and replayed in tree-lock mode instead. Never leaves the repository.
 */
class NeedsTreeLock extends Error {}

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
  // No `sortOrder` (TASK-291, plan 158 §3.10.1): the batch reorder endpoint is the ONLY
  // writer of `sortOrder`. `create()` appends to the end of the destination bucket.
  isActive?: boolean;
  metaTitle?: string | null;
  metaDescription?: string | null;
  keywords?: string[];
  ogImage?: string | null;
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
  // No `sortOrder` (TASK-291, plan 158 §3.10.1) — see {@link CreateCategoryInput}. A
  // parent change re-appends the node to its destination bucket under the tree lock.
  isActive?: boolean;
  metaTitle?: string | null;
  metaDescription?: string | null;
  /** Absent leaves the stored tags alone; `[]` clears them (TASK-437). */
  keywords?: string[];
  ogImage?: string | null;
}

/**
 * Result of a paginated category query.
 */
export interface PaginatedCategoriesResult {
  categories: Category[];
  total: number;
}

/**
 * Category with aggregated product counts.
 * Used for admin listing endpoints and the public category-by-slug read.
 *
 * `productCount` counts ACTIVE products filed DIRECTLY on the category;
 * `subtreeProductCount` counts the category AND every descendant (TASK-408) —
 * the figure the storefront category page actually lists, since a listing rolls
 * up over the whole subtree (TASK-236). A parent that files nothing itself has
 * `productCount: 0` and a non-zero subtree total, and reporting only the first
 * is what made the admin show 0 next to a storefront page listing 19.
 */
export interface CategoryWithCountResult {
  category: Category;
  productCount: number;
  subtreeProductCount: number;
}

/**
 * Result of a paginated category query with product counts.
 */
export interface PaginatedCategoriesWithCountResult {
  categories: CategoryWithCountResult[];
  total: number;
}

/**
 * Result of {@link CategoryRepository.applyTreeMoves} (TASK-291).
 *
 * `movedIds` — the nodes whose `parentId` ACTUALLY changed (a pure sibling reorder moves
 * nothing). The service needs it for the post-commit side effects (§3.13: subtree
 * re-index + the audit log line), and only the transaction that holds the snapshot can
 * compute it, so it is reported alongside the refreshed tree rather than re-derived from
 * a second, racy read.
 */
export interface TreeMovesResult {
  tree: AdminCategoryTreeNodeEntity[];
  movedIds: string[];
}

/**
 * Result of {@link CategoryRepository.setActiveMany} (TASK-293).
 *
 * The refreshed tree is read inside the same transaction as the write, so the admin panel
 * resyncs from one round-trip — exactly as `reorder` does. `updatedCount` is what the DB
 * actually wrote, not what the payload asked for, so the announcement cannot overstate it.
 */
export interface BulkStatusResult {
  tree: AdminCategoryTreeNodeEntity[];
  updatedCount: number;
}

/**
 * Result of {@link CategoryRepository.update} (TASK-291).
 *
 * `reparented` — the single-node counterpart of {@link TreeMovesResult.movedIds}: `true`
 * iff a parent change was ACTUALLY applied, as decided under the tree advisory lock by
 * `prepareReparent` against the freshly locked row (never from the service's pre-lock
 * read, which a concurrent reparent can invalidate — plan 158 §3.13). The service keys
 * its post-commit side effects (product-list cache eviction + subtree re-index) off THIS
 * flag, so a move can never commit without them.
 */
export interface CategoryUpdateResult {
  category: Category;
  reparented: boolean;
}

/**
 * Where {@link CategoryRepository.deleteSubtreeWithMove} moves the deleted subtree's
 * products (TASK-652): an EXISTING live category, or a NEW one created in the same
 * transaction. The new target's slug is generated and pre-checked by the service; the
 * unique index is the authoritative guard and surfaces as `CategorySlugConflictError`.
 *
 * `none` (TASK-655) — no target at all: allowed only for a TRULY EMPTY category (no live
 * subcategory, no product of any state, no carousel), decided under the lock; anything
 * else is `CategoryMoveTargetRequiredError`.
 */
export type CategoryDeletionTarget =
  | { kind: 'existing'; id: string }
  | { kind: 'new'; name: string; slug: string; parentId: string | null }
  | { kind: 'none' };

/**
 * Result of {@link CategoryRepository.deleteSubtreeWithMove} (TASK-652) — everything
 * the service needs for its post-commit side effects and the `category.deleted` log
 * line, computed inside the transaction that did the work.
 */
export interface CategoryDeletionResult {
  /** The category the products moved into; `null` for a target-less delete (TASK-655). */
  targetId: string | null;
  targetCreated: boolean;
  /** The tombstoned ids — the deleted category itself plus every live descendant. */
  subtreeIds: string[];
  /** Products re-filed into the target (active, inactive and soft-deleted alike). */
  movedProducts: number;
  /** Carousels switched from a subtree category to the target. */
  switchedCarousels: number;
}

/**
 * The numbers the admin delete dialog previews (TASK-652) — see
 * {@link CategoryRepository.countDeletionImpact}.
 */
export interface CategoryDeletionImpact {
  subcategoryCount: number;
  productCount: number;
  carouselCount: number;
  /** Soft-deleted products of the subtree (TASK-655) — they still block a target-less delete. */
  deletedProductCount: number;
}

@Injectable()
export class CategoryRepository {
  private readonly logger = new Logger(CategoryRepository.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly slugRedirectRepository: SlugRedirectRepository,
  ) {}

  /**
   * Find a LIVE category by ID.
   * Returns the category record, or null if it does not exist or is deleted — a
   * tombstone (TASK-653) answers exactly like a missing row, so every caller (service
   * guards, the catalogue filter resolver, attribute definitions, add-ons, carousels)
   * rejects it without a check of its own.
   *
   * `findFirst`, not `findUnique`: `deletedAt` is not part of the primary key.
   */
  findById(id: string): Promise<Category | null> {
    return this.prisma.category.findFirst({ where: { id, deletedAt: null } });
  }

  /**
   * Resolve a set of category ids to their rows in ONE read (TASK-490).
   *
   * Backs the compatibility-landing rollup, which walks every pair's ancestor
   * chain and then needs each link's slug, name and visibility to decide whether
   * that link is a page at all. Doing it per id would be an N+1 over a chain
   * that is at most a handful deep but repeats for every distinct category in
   * the catalogue.
   *
   * Unfiltered by `isActive` on purpose: the caller has to be able to tell a
   * DEACTIVATED ancestor (skip the page, keep walking up — the grandparent's
   * listing still rolls those products up) from a MISSING one.
   *
   * Filtered by `deletedAt` (TASK-653): a deleted category is MISSING, not merely
   * deactivated — its slug is mangled, so it can never be a page, and the sitemap
   * and the facet-ceiling report must not name it.
   */
  findByIds(ids: string[]): Promise<Category[]> {
    if (ids.length === 0) {
      return Promise.resolve([]);
    }
    return this.prisma.category.findMany({ where: { id: { in: ids }, deletedAt: null } });
  }

  /**
   * Find a category by slug.
   *
   * @param options.activeOnly - when `true` (the DEFAULT), a deactivated category
   *   resolves to `null`, so the public category page 404s it (TASK-297: an
   *   inactive category is WITHDRAWN FROM SALE, not merely hidden from the menu).
   *   Mirrors `ProductRepository.findBySlugWithRelations` (TASK-145).
   *
   *   Callers doing a SLUG-UNIQUENESS check must pass `{ activeOnly: false }` —
   *   an inactive category still occupies its slug, and a create/update that
   *   could not see it would sail past the guard straight into the unique
   *   constraint.
   *
   * A deleted category is NEVER returned, `activeOnly: false` included (TASK-653):
   * its slug is mangled to `deleted:<id>:<slug>` on deletion, so it cannot collide
   * with a live slug and the uniqueness check has no reason to see it.
   *
   * `findFirst`, not `findUnique`: `isActive` is not part of the unique index.
   */
  findBySlug(slug: string, options?: { activeOnly?: boolean }): Promise<Category | null> {
    return this.prisma.category.findFirst({
      where: {
        slug,
        deletedAt: null,
        ...((options?.activeOnly ?? true) ? { isActive: true } : {}),
      },
    });
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
      deletedAt: null,
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

    // Build the where clause from optional filters. Deleted categories never list
    // (TASK-653) — for `count` as well, so the pagination total matches the page.
    const where: Prisma.CategoryWhereInput = { deletedAt: null };

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
    // Fetch root categories with 3 levels of nested children.
    //
    // The `{ id: 'asc' }` tiebreaker (TASK-291, plan 158 §3.9) is load-bearing: every
    // legacy row still carries `sortOrder = 0`, and `orderBy: { sortOrder: 'asc' }`
    // alone leaves sibling order DB-arbitrary — it can differ between two requests.
    //
    // `deletedAt: null` on EVERY level (TASK-653): this is the storefront's main source
    // — navigation, `/categories/[slug]`, breadcrumbs, the sitemap, the merchant feed.
    // A tombstone also has `isActive = false`, but the visibility toggle is not the
    // deletion rule and must not be relied on to stand in for it.
    return this.prisma.category.findMany({
      where: { parentId: null, isActive: true, deletedAt: null },
      orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
      include: {
        children: {
          where: { isActive: true, deletedAt: null },
          orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
          include: {
            children: {
              where: { isActive: true, deletedAt: null },
              orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
              include: {
                children: {
                  where: { isActive: true, deletedAt: null },
                  orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
                },
              },
            },
          },
        },
      },
    });
  }

  /**
   * Admin variant of {@link findCategoryTree} (TASK-236, rewritten by TASK-291 —
   * plan 158 §3.3): the FULL tree with every `isActive` state, read as ONE FLAT
   * `findMany` (no nested `include`) and assembled here.
   *
   * Why flat: the nested-`include` form had a hard STRUCTURAL cap of four tiers, so a
   * pre-existing (or concurrently created) level-5 node was invisible to the very admin
   * who has to drag it back. The flat read has no cap. It also carries `parentId`
   * (the DnD payload is built from parent buckets), `productCount` (the "Товари" column)
   * and a 1-based `depth`.
   *
   * Sibling order is `[{ sortOrder: 'asc' }, { id: 'asc' }]` (§3.9) — the global row
   * order is stable, so pushing rows into their parent's `children` in read order
   * preserves that ordering per bucket.
   *
   * Pass a transaction client to read the post-write tree inside `applyTreeMoves`'
   * own transaction.
   *
   * Deleted categories are excluded (TASK-653) — not only for display: the admin panel
   * builds its reorder payload from these buckets, so this read and the live-only
   * reorder snapshot (`readSnapshot`) must agree on bucket membership, or every
   * reorder of a tombstone's former bucket would be refused (404 / 409 TREE_STALE).
   */
  async findCategoryTreeForAdmin(
    client: CategoryDbClient = this.prisma,
  ): Promise<AdminCategoryTreeNodeEntity[]> {
    const rows = (await client.category.findMany({
      where: { deletedAt: null },
      select: {
        id: true,
        name: true,
        slug: true,
        description: true,
        image: true,
        parentId: true,
        isActive: true,
        sortOrder: true,
        metaTitle: true,
        metaDescription: true,
        keywords: true,
        ogImage: true,
        updatedAt: true,
        _count: { select: { products: { where: { isActive: true } } } },
      },
      orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
    })) as AdminCategoryTreeRow[];

    return this.assembleAdminTree(rows);
  }

  /**
   * Assemble the flat admin rows into a tree, depth-first from the roots.
   *
   * Cycle-safe by construction: nodes are only ever reached by descending from a root
   * with a `visited` set, so a (schema-permitted, guard-prevented) parent cycle can
   * never spin this forever — such nodes are simply unreachable and omitted. A row
   * whose `parentId` points at a missing row is treated as a root.
   *
   * The same depth-first pass rolls `subtreeProductCount` up (TASK-408): a child is
   * fully built before its parent returns, so adding each child's total into the
   * parent is exact at every level and costs nothing — no extra query, no recursive
   * CTE. Rows that are unreachable (a cycle) are absent from the tree and therefore
   * contribute to no total, which is the rule their own row already follows.
   */
  private assembleAdminTree(rows: AdminCategoryTreeRow[]): AdminCategoryTreeNodeEntity[] {
    const byId = new Map<string, AdminCategoryTreeRow>(rows.map((row) => [row.id, row]));
    const childRowsByParent = new Map<string, AdminCategoryTreeRow[]>();
    const rootRows: AdminCategoryTreeRow[] = [];

    for (const row of rows) {
      if (row.parentId === null || !byId.has(row.parentId)) {
        rootRows.push(row);
        continue;
      }
      const siblings = childRowsByParent.get(row.parentId);
      if (siblings) siblings.push(row);
      else childRowsByParent.set(row.parentId, [row]);
    }

    const visited = new Set<string>();
    const build = (row: AdminCategoryTreeRow, depth: number): AdminCategoryTreeNodeEntity => {
      visited.add(row.id);
      const node = AdminCategoryTreeNodeEntity.fromRow(row, depth);
      for (const child of childRowsByParent.get(row.id) ?? []) {
        if (visited.has(child.id)) continue;
        const childNode = build(child, depth + 1);
        node.children.push(childNode);
        node.subtreeProductCount += childNode.subtreeProductCount;
      }
      return node;
    };

    return rootRows.map((row) => build(row, 1));
  }

  // ─── Batch reorder / reparent (TASK-291, plan 158 §3.6–§3.8) ────────────────

  /**
   * Apply a batch of sibling-bucket rewrites (reorder and/or reparent) in ONE
   * interactive transaction, and return the refreshed admin tree.
   *
   * Each group carries the COMPLETE, FINAL child list of one parent bucket; the array
   * index becomes `sortOrder` (0..n-1) and every listed id gets that group's `parentId`.
   * The server does NOT trust the payload's bucket set — the AFFECTED-PARENT CLOSURE
   * (described buckets ∪ the current bucket of every named id) is computed in
   * `validateAndResolveReorder` and every bucket in it is resequenced, so an incomplete
   * payload can never leave a hole.
   *
   * SCHEMA INVARIANTS this method depends on (plan §3.1 — future schema authors must
   * respect them):
   *   (a) there is NO `@@unique([parentId, sortOrder])`. The full-bucket rewrite writes
   *       one row at a time inside the transaction, so INTERMEDIATE states legitimately
   *       contain duplicate `(parentId, sortOrder)` pairs. Adding that unique would break
   *       every reorder and force a two-phase negative-offset write.
   *   (b) cycles are NOT DB-constrained (the FK is merely self-referential), so
   *       `validateAndResolveReorder`'s post-batch walk plus the in-tx
   *       `findDescendantIds` CTE re-check are the ONLY cycle guards that exist.
   *
   * Throws the domain errors of `category.errors.ts` (never HTTP exceptions — the service
   * maps them).
   */
  async applyTreeMoves(groups: ReorderGroupInput[]): Promise<TreeMovesResult> {
    // A pure same-parent reorder only needs its buckets locked; ANY reparent needs the
    // tree-scoped lock. Whether the payload reparents anything can only be known against
    // a parent map, so it is guessed from an unlocked read and — if the guess turns out
    // wrong under the locks — the transaction is replayed in tree-lock mode (see
    // `NeedsTreeLock`). Two attempts suffice: the second always takes the tree lock.
    const treeModeGuess = await this.payloadReparents(this.prisma, groups);

    try {
      return await this.runTreeMoves(groups, treeModeGuess);
    } catch (error) {
      if (error instanceof NeedsTreeLock) {
        return await this.runTreeMoves(groups, true);
      }
      throw error;
    }
  }

  private runTreeMoves(groups: ReorderGroupInput[], treeMode: boolean): Promise<TreeMovesResult> {
    return this.prisma.$transaction(
      async (tx) => {
        let snapshot: CategorySnapshotRow[];

        if (treeMode) {
          // Tree lock FIRST: while it is held, NOTHING can change any node's parent, so
          // the affected-parent closure read below is stable. The closure's bucket locks
          // are then taken in sorted order — they are what serialises this batch against
          // a concurrent PURE reorder of one of the buckets it writes into.
          await this.acquireLocks(tx, [TREE_LOCK_KEY]);
          const closure = await this.closureLockKeys(tx, groups);
          await this.acquireLocks(tx, closure);
          snapshot = await this.readSnapshot(tx);
        } else {
          const closure = await this.closureLockKeys(tx, groups);
          await this.acquireLocks(tx, closure);
          snapshot = await this.readSnapshot(tx);

          // Re-derive under the locks: if the payload turns out to move a node after all
          // (a concurrent reparent changed a node's parent between the guess and the
          // lock), abort and replay with the tree lock rather than upgrade out of order.
          const reparents = groups.some((grp) =>
            grp.orderedIds.some(
              (id) => snapshot.find((row) => row.id === id)?.parentId !== grp.parentId,
            ),
          );
          const closureNow = this.closureKeysFromSnapshot(snapshot, groups);
          if (reparents || closureNow.some((key) => !closure.includes(key))) {
            throw new NeedsTreeLock();
          }
        }

        const writes = validateAndResolveReorder(snapshot, groups);

        // Owner-mandated authoritative DB re-check (§3.7 step 3): for every node whose
        // parent actually changes, the TASK-238-hardened CTE — evaluated on THIS
        // transaction's client — must not report the new parent among its descendants.
        const parentById = new Map(snapshot.map((row) => [row.id, row.parentId] as const));
        for (const grp of groups) {
          for (const id of grp.orderedIds) {
            if (parentById.get(id) === grp.parentId || grp.parentId === null) continue;
            const descendants = await this.findDescendantIds(id, tx);
            if (descendants.includes(grp.parentId)) {
              throw new CategoryCycleError(
                `Moving category "${id}" under "${grp.parentId}" would create a circular reference`,
              );
            }
          }
        }

        await this.writeRows(tx, writes);

        // The MOVED set (plan §3.13): the rows whose `parentId` actually changes. It is
        // exactly the set of subtree roots whose products' indexed ancestor chains went
        // stale, so the service reindexes and logs precisely these.
        const movedIds = writes
          .filter((write) => parentById.get(write.id) !== write.parentId)
          .map((write) => write.id);

        return { tree: await this.findCategoryTreeForAdmin(tx), movedIds };
      },
      // A lock wait happens INSIDE the transaction, so it is charged against `timeout`
      // (not `maxWait`); the defaults (5s/2s) are raised so a short queue of admins can
      // never surface as a spurious transaction abort.
      { timeout: 15_000, maxWait: 10_000 },
    );
  }

  /** Does the payload change ANY node's `parentId` relative to `client`'s parent map? */
  private async payloadReparents(
    client: CategoryDbClient,
    groups: ReorderGroupInput[],
  ): Promise<boolean> {
    const ids = groups.flatMap((grp) => grp.orderedIds);
    if (ids.length === 0) return false;

    const rows = await client.category.findMany({
      where: { id: { in: ids }, deletedAt: null },
      select: { id: true, parentId: true },
    });
    const parentById = new Map(rows.map((row) => [row.id, row.parentId] as const));

    // An id the snapshot does not know (a deleted one included — TASK-653) is a 404 the
    // rules module will raise; treat it as "not a reparent" here so the lock choice
    // stays cheap.
    return groups.some((grp) =>
      grp.orderedIds.some((id) => parentById.has(id) && parentById.get(id) !== grp.parentId),
    );
  }

  /** Sorted, de-duplicated lock keys for the affected-parent closure of `groups`. */
  private async closureLockKeys(
    tx: Prisma.TransactionClient,
    groups: ReorderGroupInput[],
  ): Promise<string[]> {
    const ids = groups.flatMap((grp) => grp.orderedIds);
    const rows = ids.length
      ? await tx.category.findMany({
          where: { id: { in: ids }, deletedAt: null },
          select: { id: true, parentId: true, sortOrder: true },
        })
      : [];

    return this.closureKeysFromSnapshot(rows, groups);
  }

  private closureKeysFromSnapshot(
    rows: Array<{ id: string; parentId: string | null }>,
    groups: ReorderGroupInput[],
  ): string[] {
    const parentById = new Map(rows.map((row) => [row.id, row.parentId] as const));
    const keys = new Set<string>();

    for (const grp of groups) {
      keys.add(bucketLockKey(grp.parentId));
      for (const id of grp.orderedIds) {
        if (parentById.has(id)) keys.add(bucketLockKey(parentById.get(id) ?? null));
      }
    }

    // Sorted order is what makes multi-key acquisition deadlock-free.
    return [...keys].sort();
  }

  /**
   * Take transaction-scoped advisory locks. Delegates to the SHARED helper
   * (`common/reorder/sibling-order.util.ts`) — it de-duplicates and sorts the keys, which
   * is what makes multi-key acquisition deadlock-free — so the flat sortable admins reuse
   * exactly this recipe rather than re-deriving it. Locks are released automatically on
   * COMMIT or ROLLBACK, never manually, never leaked.
   *
   * Callers that need both the tree key and bucket keys call this TWICE (tree first,
   * then the buckets): the global order `tree → buckets(sorted)` is what keeps a
   * reparenting batch and a pure reorder from deadlocking each other.
   */
  private acquireLocks(tx: Prisma.TransactionClient, keys: string[]): Promise<void> {
    return acquireAdvisoryLocks(tx, keys);
  }

  /**
   * The WHOLE LIVE `category` tree — every row except the tombstones, never narrowed to
   * the payload. Load-bearing (§3.7): a snapshot filtered to the payload ids + affected
   * parents makes BOTH the multi-move cycle walk and the `level + height` depth check
   * uncomputable, because a moved node's own descendants and its intermediate ancestors
   * would be absent. Category is a taxonomy (tens–low hundreds of rows) — the full read
   * is trivially cheap.
   *
   * Dropping the tombstones (TASK-653) does NOT break that completeness: deletion is
   * always a whole-subtree cascade (invariant I2 — a live category never has a deleted
   * ancestor, and a deleted one never has a live child), so every live node's ancestors
   * and descendants are live and all present. Leaving them in would make a tombstone
   * look like a member of its former bucket (a perpetual TREE_STALE) and a legal
   * parent for a move.
   */
  private readSnapshot(tx: Prisma.TransactionClient): Promise<CategorySnapshotRow[]> {
    return tx.category.findMany({
      where: { deletedAt: null },
      select: { id: true, parentId: true, sortOrder: true },
    });
  }

  /**
   * Apply resolved writes through the SHARED writer (`common/reorder`): `updateMany`
   * (not `update`) so a row that vanished concurrently is a silent no-op rather than a
   * P2025 aborting an otherwise legal batch. Rows already at their target are never in
   * `writes` (the rules module omits them), so `@updatedAt` churn — which the storefront
   * sitemap's `lastModified` reads — is avoided.
   *
   * The flat resources call the util's `writeSiblingOrder(delegate, orderedIds, scope)`
   * instead: same primitive, minus the `parentId` the tree also has to assign.
   */
  private writeRows(tx: Prisma.TransactionClient, writes: ResolvedWrite[]): Promise<void> {
    return applySortOrderWrites(tx.category, writes);
  }

  /**
   * Find a category by ID with its product counts — direct and subtree-wide.
   *
   * This backs the PUBLIC category-by-slug read, whose page lists the whole
   * subtree (TASK-236). Reporting only the direct count there was the same
   * mismatch the admin tree had (TASK-408), so both numbers are returned and the
   * caller picks the one it means. A leaf resolves its subtree to just itself, in
   * which case the second count is skipped — that is the overwhelmingly common
   * case and it costs exactly what it always did, plus the one recursive CTE.
   *
   * Both counts use {@link PUBLIC_PRODUCT_WHERE} (TASK-781), so the number equals
   * what the listing under it shows: soft-deleted products and — the case the
   * old `isActive`-only count missed — products filed in a DEACTIVATED child of
   * this subtree are not counted, because the listing does not show them either.
   */
  async findWithProductCount(id: string): Promise<CategoryWithCountResult | null> {
    // Live rows only (TASK-653) — defence in depth: the public caller resolves the id
    // through `findBySlug`, which already hides tombstones.
    const category = await this.prisma.category.findFirst({
      where: { id, deletedAt: null },
    });

    if (!category) {
      return null;
    }

    const [productCount, subtreeIds] = await Promise.all([
      this.prisma.product.count({ where: { categoryId: id, ...PUBLIC_PRODUCT_WHERE } }),
      this.findSubtreeIds(id),
    ]);

    const subtreeProductCount =
      subtreeIds.length <= 1
        ? productCount
        : await this.prisma.product.count({
            where: { categoryId: { in: subtreeIds }, ...PUBLIC_PRODUCT_WHERE },
          });

    return { category, productCount, subtreeProductCount };
  }

  /**
   * Subtree product totals for EVERY category, keyed by id (TASK-408).
   *
   * Two queries, whatever the page size: the whole `(id, parent_id)` taxonomy —
   * tens of rows, the same read the admin tree already does — and one `groupBy`
   * of active products per category. The rollup then happens in memory.
   *
   * The alternative, a recursive CTE per listed row, would fire `limit` of them
   * for one page; this fires two for any page. It is also the only shape that can
   * total a category whose descendants are NOT on the current page, which is the
   * normal case for a paginated, filtered listing.
   *
   * Cycle-safe the same way {@link assembleAdminTree} is — descent from the roots
   * with a `visited` set. A row unreachable from any root (only possible under a
   * parent cycle the write guards prevent) still reports its own direct count
   * rather than nothing at all.
   */
  private async loadSubtreeProductCounts(): Promise<Map<string, number>> {
    const [rows, directRows] = await Promise.all([
      this.prisma.category.findMany({
        where: { deletedAt: null },
        select: { id: true, parentId: true },
      }),
      this.prisma.product.groupBy({
        by: ['categoryId'],
        where: { isActive: true },
        _count: { _all: true },
      }),
    ]);

    const directById = new Map<string, number>();
    for (const row of directRows) {
      directById.set(row.categoryId, row._count._all);
    }

    const knownIds = new Set(rows.map((row) => row.id));
    const childIdsByParent = new Map<string, string[]>();
    const rootIds: string[] = [];
    for (const row of rows) {
      if (row.parentId === null || !knownIds.has(row.parentId)) {
        rootIds.push(row.id);
        continue;
      }
      const siblings = childIdsByParent.get(row.parentId);
      if (siblings) siblings.push(row.id);
      else childIdsByParent.set(row.parentId, [row.id]);
    }

    const totals = new Map<string, number>();
    const visited = new Set<string>();
    const walk = (id: string): number => {
      visited.add(id);
      let total = directById.get(id) ?? 0;
      for (const childId of childIdsByParent.get(id) ?? []) {
        if (visited.has(childId)) continue;
        total += walk(childId);
      }
      totals.set(id, total);
      return total;
    };
    for (const id of rootIds) walk(id);

    for (const row of rows) {
      if (!totals.has(row.id)) totals.set(row.id, directById.get(row.id) ?? 0);
    }

    return totals;
  }

  /**
   * Find all categories with their product counts (admin listing).
   * Supports pagination and optional filtering.
   *
   * Each row carries BOTH counts (TASK-408): `productCount` is what this category
   * files directly, `subtreeProductCount` what it and its descendants file
   * together — the number the storefront listing for that category shows.
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

    // Build the where clause from optional filters. Deleted categories never list
    // (TASK-653) — for `count` as well, so the pagination total matches the page.
    const where: Prisma.CategoryWhereInput = { deletedAt: null };

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

    const [categories, total, subtreeCounts] = await Promise.all([
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
      this.loadSubtreeProductCounts(),
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
      subtreeProductCount: subtreeCounts.get(cat.id) ?? cat._count.products,
    }));

    return { categories: categoriesWithCount, total };
  }

  /**
   * Create a new category, APPENDED to the end of its sibling bucket
   * (`sortOrder = max(siblings) + 1`, `0` for the first child) — TASK-291, plan 158
   * §3.10.2. The old hard `0` default materialised every new category at the top of
   * (or arbitrarily within) its siblings, with no input left to fix it once the
   * hand-typed `sortOrder` field is gone.
   *
   * Runs inside a transaction holding the DESTINATION bucket's advisory lock: the
   * `max + 1` read must not race a concurrent append or a concurrent resequence
   * (`applyTreeMoves`), which would hand out a duplicate slot.
   */
  create(data: CreateCategoryInput & { slug: string }): Promise<Category> {
    const parentId = data.parentId ?? null;

    return this.prisma.$transaction(async (tx) => {
      await this.acquireLocks(tx, [bucketLockKey(parentId)]);

      // Re-check the parent UNDER the bucket lock (TASK-653): the service's check ran
      // before it, and a concurrent delete of the parent's subtree holds exactly this
      // lock until it commits. Without the re-check, a create that waited on that lock
      // would insert a live child under a tombstone — breaking invariant I2, which the
      // snapshot and ancestor reads rely on.
      if (parentId !== null) {
        const parent = await tx.category.findFirst({
          where: { id: parentId, deletedAt: null },
          select: { id: true },
        });
        if (!parent) {
          throw new CategoryNotFoundError(`Parent category "${parentId}" not found`);
        }
      }

      // Live rows only: a tombstone keeps its old `sortOrder` but is no longer a sibling.
      const { _max } = await tx.category.aggregate({
        where: { parentId, deletedAt: null },
        _max: { sortOrder: true },
      });
      const nextSortOrder = _max.sortOrder === null ? 0 : _max.sortOrder + 1;

      return tx.category.create({
        data: {
          name: data.name,
          slug: data.slug,
          description: data.description ?? null,
          image: data.image ?? null,
          parentId,
          sortOrder: nextSortOrder,
          isActive: data.isActive ?? true,
          metaTitle: data.metaTitle ?? null,
          metaDescription: data.metaDescription ?? null,
          keywords: data.keywords ?? [],
          ogImage: data.ogImage ?? null,
        },
      });
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
   *
   * Returns {@link CategoryUpdateResult} — the `reparented` flag is the AUTHORITATIVE
   * (in-transaction, tree-locked) answer to "did this write actually move the node?", and
   * is what the service gates its post-commit side effects on (§3.13).
   */
  async update(
    id: string,
    data: UpdateCategoryInput,
    slugRename?: SlugRenameInput,
  ): Promise<CategoryUpdateResult> {
    // PRESENCE of `parentId` is not a parent CHANGE: a full-object PUT re-sends the
    // unchanged current parent on every rename, and taking the whole-tree lock for that
    // would serialise every rename against every drag-and-drop (§3.10.4 scopes the locked
    // path to an ACTUAL change). This read is UNLOCKED and therefore only a hint — which
    // is safe in BOTH directions:
    //   • hint says "changing"  → `prepareReparent` re-decides under the tree lock and may
    //     find there is nothing to move (someone got there first) → `reparented: false`.
    //   • hint says "unchanged" → `parentId` is DROPPED from the write, so a reparent that
    //     commits between this read and the write is never silently undone OUTSIDE the
    //     locks (it simply wins — an equivalent serialisation of the two requests).
    const mayChangeParent =
      data.parentId !== undefined && data.parentId !== (await this.currentParentId(id));

    // Parent is present but unchanged as of the read above → never write it.
    let writeData: UpdateCategoryInput = data;
    if (data.parentId !== undefined && !mayChangeParent) {
      writeData = { ...data };
      delete writeData.parentId;
    }

    if (!slugRename && !mayChangeParent) {
      const category = await this.prisma.category.update({ where: { id }, data: writeData });
      return { category, reparented: false };
    }

    return this.prisma.$transaction(async (tx) => {
      // A parent change is a WHOLE-TREE mutation (cycle + depth are whole-tree
      // invariants), so it runs under exactly the same locks as a reparenting batch —
      // otherwise `PUT /:id` would race `applyTreeMoves` outside every lock this design
      // relies on (plan 158 §3.10.4).
      const reparent = mayChangeParent ? await this.prepareReparent(tx, id, data.parentId!) : null;

      const category = await tx.category.update({
        where: { id },
        data: reparent ? { ...writeData, sortOrder: reparent.sortOrder } : writeData,
      });

      if (reparent) {
        await this.writeRows(tx, reparent.sourceRewrites);
      }

      if (slugRename) {
        await this.slugRedirectRepository.recordRename(
          tx,
          SlugRedirectEntity.CATEGORY,
          slugRename.oldSlug,
          slugRename.newSlug,
        );
      }

      return { category, reparented: reparent !== null };
    });
  }

  /**
   * The committed `parentId` of `id`. Read WITHOUT any lock — a hint only (see
   * {@link update}); every authoritative parentage decision is re-taken by
   * `prepareReparent` under {@link TREE_LOCK_KEY}.
   */
  private async currentParentId(id: string): Promise<string | null> {
    const current = await this.prisma.category.findFirst({
      where: { id, deletedAt: null },
      select: { parentId: true },
    });
    if (!current) {
      throw new CategoryNotFoundError(`Category "${id}" not found`);
    }
    return current.parentId;
  }

  /**
   * Guard + resolve a single-node parent change inside an already-open transaction
   * (plan 158 §3.10.4). Takes the tree-scoped lock plus the source/destination bucket
   * locks, runs the self-parent / not-found / cycle / depth guards against an in-tx
   * snapshot, and returns the node's appended `sortOrder` in the destination bucket
   * plus the writes that re-densify the SOURCE bucket to a contiguous 0..n-1.
   *
   * Returns `null` when `newParentId` equals the committed parent (no actual move) —
   * the caller then writes `data` unchanged.
   */
  private async prepareReparent(
    tx: Prisma.TransactionClient,
    id: string,
    newParentId: string | null,
  ): Promise<{ sortOrder: number; sourceRewrites: ResolvedWrite[] } | null> {
    if (newParentId === id) {
      throw new CategorySelfParentError();
    }

    // Tree lock FIRST (before any read), so parentage cannot shift underneath the guards.
    await this.acquireLocks(tx, [TREE_LOCK_KEY]);

    // Live rows only (TASK-653) — authoritative, under the tree lock: a deleted node
    // cannot be moved, and (via the live-only snapshot below) nothing can be moved
    // UNDER a deleted node.
    const current = await tx.category.findFirst({
      where: { id, deletedAt: null },
      select: { parentId: true },
    });
    if (!current) {
      throw new CategoryNotFoundError(`Category "${id}" not found`);
    }
    if (current.parentId === newParentId) {
      return null; // parentId present in the payload but unchanged — not a move
    }

    const oldParentId = current.parentId;
    await this.acquireLocks(tx, [bucketLockKey(oldParentId), bucketLockKey(newParentId)].sort());

    const snapshot = await this.readSnapshot(tx);
    if (newParentId !== null && !snapshot.some((row) => row.id === newParentId)) {
      throw new CategoryNotFoundError(`Parent category "${newParentId}" not found`);
    }

    // Authoritative DB cycle re-check (the TASK-238-hardened CTE), then the depth rule.
    if (newParentId !== null) {
      const descendants = await this.findDescendantIds(id, tx);
      if (descendants.includes(newParentId)) {
        throw new CategoryCycleError();
      }
    }
    assertMoveDepth(snapshot, id, newParentId);

    const destMax = snapshot
      .filter((row) => row.parentId === newParentId && row.id !== id)
      .reduce((max, row) => Math.max(max, row.sortOrder), -1);

    const remainingSource = snapshot
      .filter((row) => row.parentId === oldParentId && row.id !== id)
      .sort((a, b) => a.sortOrder - b.sortOrder || a.id.localeCompare(b.id));

    const sourceRewrites: ResolvedWrite[] = [];
    remainingSource.forEach((row, index) => {
      if (row.sortOrder === index) return; // already at target
      sourceRewrites.push({ id: row.id, parentId: oldParentId, sortOrder: index });
    });

    return { sortOrder: destMax + 1, sourceRewrites };
  }

  /**
   * Set `isActive` on many categories at once, and return the refreshed admin tree
   * (TASK-293).
   *
   * NO CASCADE, by owner decision: exactly the named rows are written. Descendants keep
   * their own `isActive` — a bulk deactivate is the per-row toggle applied N times, not a
   * subtree operation. (Deactivating a parent already hides its whole branch from the
   * public tree: `findCategoryTree` filters `isActive` at every level of the nested
   * include, so an inactive node — and with it everything under it — is simply not
   * returned. Only the branch's *visibility* is inherited; the flags are not.)
   *
   * Needs no advisory lock: it touches neither `parentId` nor `sortOrder`, so it cannot
   * race the reorder invariants that `applyTreeMoves` protects. Unknown ids are rejected
   * as a whole (all-or-nothing) rather than silently skipped, so the admin panel can never
   * report "12 updated" when only 11 rows existed.
   */
  async setActiveMany(ids: string[], isActive: boolean): Promise<BulkStatusResult> {
    return this.prisma.$transaction(async (tx) => {
      // A deleted id is unknown (TASK-653): it 404s the batch instead of flipping a
      // tombstone's `isActive` back on.
      const found = await tx.category.findMany({
        where: { id: { in: ids }, deletedAt: null },
        select: { id: true },
      });

      if (found.length !== ids.length) {
        const known = new Set(found.map((row) => row.id));
        const missing = ids.filter((id) => !known.has(id));
        throw new CategoryNotFoundError(`Unknown category id(s): ${missing.join(', ')}`);
      }

      const { count } = await tx.category.updateMany({
        where: { id: { in: ids }, deletedAt: null },
        data: { isActive },
      });

      return { tree: await this.findCategoryTreeForAdmin(tx), updatedCount: count };
    });
  }

  // ─── Deletion (TASK-652, decision B-2 of plan 178) ──────────────────────────

  /**
   * Delete a category: tombstone its WHOLE subtree after moving every product and
   * carousel out of it into `target` — all in ONE transaction, so there is no state in
   * which a product points at a tombstone (invariant I1) or a live category sits under
   * one (I2).
   *
   * Steps, in order:
   *   1. Tree lock, then the node itself (live, or `CategoryNotFoundError`) and its
   *      subtree, then the SORTED bucket locks: the node's own bucket, the bucket of
   *      every subtree node (a concurrent `create` under one of them takes exactly that
   *      lock) and — for a new target — the destination bucket. Same global order as
   *      `applyTreeMoves` / `prepareReparent`: tree first, then sorted buckets.
   *   2. The subtree is re-read under all locks; if a child appeared between the two
   *      reads (a create that committed before we got its bucket lock) the request is
   *      refused as `CategoryTreeStaleError` rather than leaving a live orphan.
   *   3. The target is validated AUTHORITATIVELY here — the service's checks were only
   *      fast-fail hints: it (or the new target's parent) must be live and outside the
   *      subtree.
   *   4. A new target is created at the end of its bucket (live rows only); a slug
   *      collision on the unique index is `CategorySlugConflictError`.
   *   5. `product.updateMany` — NO `deletedAt` filter: a soft-deleted product moves too,
   *      so a product restored later never points at a tombstone. `isActive` and
   *      `deletedAt` of products are never touched.
   *   6. `carousel.updateMany` — the FK's `SetNull` only fires on a HARD delete, so a
   *      carousel left on a tombstone would 404 on its next edit.
   *   7. Each subtree row: `deletedAt = now`, `isActive = false`, slug mangled to
   *      `deleted:<id>:<slug>` so the address is free for a new category (I3).
   *
   * A `none` target (TASK-655) replaces steps 3-6 with
   * {@link CategoryRepository.assertDeletableWithoutTarget} — the category must be a
   * truly empty leaf — and tombstones the single row; `targetId` is then `null`.
   *
   * Throws the domain errors of `category.errors.ts`; any throw rolls everything back.
   */
  deleteSubtreeWithMove(
    id: string,
    target: CategoryDeletionTarget,
    now: Date = new Date(),
  ): Promise<CategoryDeletionResult> {
    return this.prisma.$transaction(
      async (tx) => {
        // Tree lock FIRST: while it is held no node can change parent, so the subtree
        // read below cannot be invalidated by a reparent.
        await this.acquireLocks(tx, [TREE_LOCK_KEY]);

        const node = await tx.category.findFirst({
          where: { id, deletedAt: null },
          select: { id: true, parentId: true },
        });
        if (!node) {
          throw new CategoryNotFoundError(`Category "${id}" not found`);
        }

        const subtreeIds = await this.findSubtreeIds(id, tx);
        const bucketKeys = [
          bucketLockKey(node.parentId),
          ...subtreeIds.map((subtreeId) => bucketLockKey(subtreeId)),
        ];
        if (target.kind === 'new') {
          bucketKeys.push(bucketLockKey(target.parentId));
        }
        await this.acquireLocks(tx, bucketKeys);

        const subtreeNow = await this.findSubtreeIds(id, tx);
        const subtree = new Set(subtreeIds);
        if (subtreeNow.length !== subtree.size || subtreeNow.some((sid) => !subtree.has(sid))) {
          throw new CategoryTreeStaleError();
        }

        let targetId: string | null = null;
        let movedProducts = 0;
        let switchedCarousels = 0;
        if (target.kind === 'none') {
          await this.assertDeletableWithoutTarget(tx, id, subtreeIds);
        } else {
          if (target.kind === 'existing') {
            if (subtree.has(target.id)) {
              throw new CategoryMoveTargetInSubtreeError();
            }
            const live = await tx.category.findFirst({
              where: { id: target.id, deletedAt: null },
              select: { id: true },
            });
            if (!live) {
              throw new CategoryMoveTargetNotFoundError(
                `Move target category "${target.id}" not found`,
              );
            }
            targetId = target.id;
          } else {
            targetId = await this.createDeletionTarget(tx, target, subtree);
          }

          const moved = await tx.product.updateMany({
            where: { categoryId: { in: subtreeIds } },
            data: { categoryId: targetId },
          });
          const switched = await tx.carousel.updateMany({
            where: { categoryId: { in: subtreeIds } },
            data: { categoryId: targetId },
          });
          movedProducts = moved.count;
          switchedCarousels = switched.count;
        }

        const rows = await tx.category.findMany({
          where: { id: { in: subtreeIds } },
          select: { id: true, slug: true },
        });
        for (const row of rows) {
          await tx.category.update({
            where: { id: row.id },
            data: { deletedAt: now, isActive: false, slug: `deleted:${row.id}:${row.slug}` },
          });
        }

        return {
          targetId,
          targetCreated: target.kind === 'new',
          subtreeIds,
          movedProducts,
          switchedCarousels,
        };
      },
      // Lock waits count against `timeout` — same budget as `runTreeMoves`.
      { timeout: 15_000, maxWait: 10_000 },
    );
  }

  /**
   * The authoritative "truly empty" check of a target-less delete (TASK-655), run under
   * the caller's tree + bucket locks after the stale re-check: the category has NO live
   * subcategory, NO product in ANY state and NO carousel pointing at it. The product
   * count deliberately has no `deletedAt` filter — a soft-deleted product left on a
   * tombstone would break invariant I1 the moment TASK-656 restores it.
   */
  private async assertDeletableWithoutTarget(
    tx: Prisma.TransactionClient,
    id: string,
    subtreeIds: string[],
  ): Promise<void> {
    if (subtreeIds.length !== 1) {
      throw new CategoryMoveTargetRequiredError(
        'The category has subcategories — name a move target for its products',
      );
    }
    // Sequential on purpose: one interactive-transaction connection runs them in turn.
    const products = await tx.product.count({ where: { categoryId: id } });
    if (products > 0) {
      throw new CategoryMoveTargetRequiredError(
        'The category still holds products (deleted ones included) — name a move target',
      );
    }
    const carousels = await tx.carousel.count({ where: { categoryId: id } });
    if (carousels > 0) {
      throw new CategoryMoveTargetRequiredError(
        'Homepage carousels point at the category — name a move target for them',
      );
    }
  }

  /**
   * Create the new move target of a delete inside its transaction (TASK-652). Its
   * destination bucket lock is already held by the caller, so the `max + 1` read cannot
   * race a concurrent append.
   */
  private async createDeletionTarget(
    tx: Prisma.TransactionClient,
    target: Extract<CategoryDeletionTarget, { kind: 'new' }>,
    subtree: Set<string>,
  ): Promise<string> {
    if (target.parentId !== null) {
      if (subtree.has(target.parentId)) {
        throw new CategoryMoveTargetInSubtreeError(
          'The parent of the new category must be outside the subtree being deleted',
        );
      }
      const parent = await tx.category.findFirst({
        where: { id: target.parentId, deletedAt: null },
        select: { id: true },
      });
      if (!parent) {
        throw new CategoryMoveTargetNotFoundError(
          `Parent category "${target.parentId}" of the new move target not found`,
        );
      }
    }

    const { _max } = await tx.category.aggregate({
      where: { parentId: target.parentId, deletedAt: null },
      _max: { sortOrder: true },
    });

    try {
      const created = await tx.category.create({
        data: {
          name: target.name,
          slug: target.slug,
          parentId: target.parentId,
          sortOrder: _max.sortOrder === null ? 0 : _max.sortOrder + 1,
        },
        select: { id: true },
      });
      return created.id;
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new CategorySlugConflictError();
      }
      throw error;
    }
  }

  /**
   * What deleting `id` would touch (TASK-652) — the admin delete dialog's preview:
   *   - `subcategoryCount` — the live subtree minus the category itself;
   *   - `productCount` — EVERY non-deleted product of the subtree, inactive ones
   *     included, because all of them move (NOT {@link PUBLIC_PRODUCT_WHERE}, which
   *     would under-report). Soft-deleted products move too (step 5 of
   *     {@link CategoryRepository.deleteSubtreeWithMove}) but are deliberately left out
   *     of this count — the dialog describes the catalogue the operator can see;
   *   - `carouselCount` — carousels pointing into the subtree, which switch too;
   *   - `deletedProductCount` (TASK-655) — the soft-deleted products of the subtree.
   *     They are invisible in the catalogue but still block a target-less delete, so
   *     the dialog needs them to tell a TRULY empty branch (all four counts zero).
   */
  async countDeletionImpact(id: string): Promise<CategoryDeletionImpact> {
    const subtreeIds = await this.findSubtreeIds(id);
    const [productCount, deletedProductCount, carouselCount] = await Promise.all([
      this.prisma.product.count({
        where: { categoryId: { in: subtreeIds }, deletedAt: null },
      }),
      this.prisma.product.count({
        where: { categoryId: { in: subtreeIds }, deletedAt: { not: null } },
      }),
      this.prisma.carousel.count({ where: { categoryId: { in: subtreeIds } } }),
    ]);

    return {
      subcategoryCount: subtreeIds.length - 1,
      productCount,
      carouselCount,
      deletedProductCount,
    };
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
   * Find the live direct children of a category (deleted ones excluded — TASK-653).
   * Returns categories whose parentId matches the given ID.
   */
  findChildren(parentId: string): Promise<Category[]> {
    return this.prisma.category.findMany({
      where: { parentId, deletedAt: null },
      orderBy: { sortOrder: 'asc' },
    });
  }

  /**
   * Find all descendant IDs of a category (for cycle detection).
   * Uses a PostgreSQL recursive CTE to fetch all descendants
   * in a single query instead of N+1 BFS traversal.
   * Returns an array of all descendant category IDs.
   *
   * `client` (TASK-291): pass an interactive-transaction client to evaluate the CTE
   * against the transaction's OWN uncommitted state — that is what the in-tx cycle
   * re-check needs. The CTE body is byte-identical to the TASK-238 hardening (physical
   * `categories` / `parent_id` names, `UNION` so it terminates even on an existing
   * cycle, strict descendants excluding self); only the client is parameterised.
   *
   * Live descendants only (TASK-653): `deleted_at IS NULL` in BOTH halves. Under
   * invariant I2 (deletion is a whole-subtree cascade) this changes no result today —
   * a live node has no deleted descendant; the filter is the guard against a future
   * write path that breaks I2. Proven on real Postgres in
   * `test/category.repository.int-spec.ts`.
   */
  async findDescendantIds(
    categoryId: string,
    client: CategoryDbClient = this.prisma,
  ): Promise<string[]> {
    const result = await client.$queryRaw<Array<{ id: string }>>`
      WITH RECURSIVE descendants AS (
        -- Base case: live direct children of the category
        SELECT id FROM categories WHERE parent_id = ${categoryId} AND deleted_at IS NULL
        UNION
        -- Recursive case: live children of children
        SELECT c.id FROM categories c
        INNER JOIN descendants d ON c.parent_id = d.id
        WHERE c.deleted_at IS NULL
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
   *
   * `client` (TASK-652): pass an interactive-transaction client to resolve the subtree
   * under the locks `deleteSubtreeWithMove` holds — same contract as
   * {@link findDescendantIds}.
   *
   * Live descendants only (TASK-653): `deleted_at IS NULL` in the recursive step. The
   * base row is left unfiltered and the self id is added regardless, so the contract
   * "self is always present" holds for a tombstone too — whose subtree then resolves to
   * just itself, which holds no product (invariant I1). `deleteSubtreeWithMove` calls
   * this only for a node it has just verified live under the lock.
   */
  async findSubtreeIds(
    categoryId: string,
    client: CategoryDbClient = this.prisma,
  ): Promise<string[]> {
    const result = await client.$queryRaw<Array<{ id: string }>>`
      WITH RECURSIVE subtree AS (
        -- Base case: the category itself
        SELECT id, parent_id FROM categories WHERE id = ${categoryId}
        UNION
        -- Recursive case: live children of nodes already in the subtree
        SELECT c.id, c.parent_id FROM categories c
        INNER JOIN subtree s ON c.parent_id = s.id
        WHERE c.deleted_at IS NULL
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
