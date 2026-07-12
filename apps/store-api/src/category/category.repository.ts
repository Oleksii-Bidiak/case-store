import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma';
import { Category, Prisma, SlugRedirectEntity } from '@prisma/client';
import { SlugRedirectRepository } from '../slug-redirect';
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
  CategoryNotFoundError,
  CategorySelfParentError,
} from './category.errors';

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
 * Advisory-lock key namespace (plan 158 §3.8). Postgres advisory locks are
 * DATABASE-GLOBAL, and the same recipe is meant to be reused by the flat sortable
 * admins (banners / blog-categories / device-brands), which all have a `'__root__'`
 * bucket — without the prefix a banner reorder would serialise against a root-category
 * reorder.
 */
const LOCK_NAMESPACE = 'categories:';

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
const TREE_LOCK_KEY = `${LOCK_NAMESPACE}__tree__`;

/** Per-bucket lock key. `null` (the root bucket) has no row to lock — hence the sentinel. */
const bucketLockKey = (parentId: string | null): string =>
  `${LOCK_NAMESPACE}${parentId ?? '__root__'}`;

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
    // Fetch root categories with 3 levels of nested children.
    //
    // The `{ id: 'asc' }` tiebreaker (TASK-291, plan 158 §3.9) is load-bearing: every
    // legacy row still carries `sortOrder = 0`, and `orderBy: { sortOrder: 'asc' }`
    // alone leaves sibling order DB-arbitrary — it can differ between two requests.
    return this.prisma.category.findMany({
      where: { parentId: null, isActive: true },
      orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
      include: {
        children: {
          where: { isActive: true },
          orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
          include: {
            children: {
              where: { isActive: true },
              orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
              include: {
                children: {
                  where: { isActive: true },
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
   */
  async findCategoryTreeForAdmin(
    client: CategoryDbClient = this.prisma,
  ): Promise<AdminCategoryTreeNodeEntity[]> {
    const rows = (await client.category.findMany({
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
        node.children.push(build(child, depth + 1));
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
      where: { id: { in: ids } },
      select: { id: true, parentId: true },
    });
    const parentById = new Map(rows.map((row) => [row.id, row.parentId] as const));

    // An id the snapshot does not know is a 404 the rules module will raise; treat it as
    // "not a reparent" here so the lock choice stays cheap.
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
          where: { id: { in: ids } },
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
   * Take transaction-scoped advisory locks, in the given (sorted) order. Released
   * automatically on COMMIT or ROLLBACK — never manually, never leaked.
   */
  private async acquireLocks(tx: Prisma.TransactionClient, keys: string[]): Promise<void> {
    for (const key of keys) {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${key}::text, 0))`;
    }
  }

  /**
   * The WHOLE `category` table — NO `where` clause. Load-bearing (§3.7): a filtered
   * snapshot (payload ids + affected parents only) makes BOTH the multi-move cycle walk
   * and the `level + height` depth check uncomputable, because a moved node's own
   * descendants and its intermediate ancestors would be absent. Category is a taxonomy
   * (tens–low hundreds of rows) — the full read is trivially cheap.
   */
  private readSnapshot(tx: Prisma.TransactionClient): Promise<CategorySnapshotRow[]> {
    return tx.category.findMany({
      select: { id: true, parentId: true, sortOrder: true },
    });
  }

  /**
   * Apply resolved writes. `updateMany` (not `update`) so a row that vanished
   * concurrently is a silent no-op rather than a P2025 aborting an otherwise legal batch.
   * Rows already at their target are never in `writes`, so `@updatedAt` churn (which the
   * storefront sitemap's `lastModified` reads) is avoided.
   */
  private async writeRows(tx: Prisma.TransactionClient, writes: ResolvedWrite[]): Promise<void> {
    for (const write of writes) {
      await tx.category.updateMany({
        where: { id: write.id },
        data: { parentId: write.parentId, sortOrder: write.sortOrder },
      });
    }
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

      const { _max } = await tx.category.aggregate({
        where: { parentId },
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
   */
  update(id: string, data: UpdateCategoryInput, slugRename?: SlugRenameInput): Promise<Category> {
    const mayChangeParent = data.parentId !== undefined;

    if (!slugRename && !mayChangeParent) {
      return this.prisma.category.update({
        where: { id },
        data,
      });
    }

    return this.prisma.$transaction(async (tx) => {
      // A parent change is a WHOLE-TREE mutation (cycle + depth are whole-tree
      // invariants), so it runs under exactly the same locks as a reparenting batch —
      // otherwise `PUT /:id` would race `applyTreeMoves` outside every lock this design
      // relies on (plan 158 §3.10.4).
      const reparent = mayChangeParent ? await this.prepareReparent(tx, id, data.parentId!) : null;

      const updated = await tx.category.update({
        where: { id },
        data: reparent ? { ...data, sortOrder: reparent.sortOrder } : data,
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

      return updated;
    });
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

    const current = await tx.category.findUnique({
      where: { id },
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
   *
   * `client` (TASK-291): pass an interactive-transaction client to evaluate the CTE
   * against the transaction's OWN uncommitted state — that is what the in-tx cycle
   * re-check needs. The CTE body is byte-identical to the TASK-238 hardening (physical
   * `categories` / `parent_id` names, `UNION` so it terminates even on an existing
   * cycle, strict descendants excluding self); only the client is parameterised.
   */
  async findDescendantIds(
    categoryId: string,
    client: CategoryDbClient = this.prisma,
  ): Promise<string[]> {
    const result = await client.$queryRaw<Array<{ id: string }>>`
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
