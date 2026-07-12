/**
 * Shared sibling-ordering primitive (TASK-291, plan 158 §4).
 *
 * Extracted from `CategoryRepository.applyTreeMoves` so the flat sortable admins
 * (banners / blog-categories / device-brands / product-groups) do not have to re-derive
 * the advisory-lock and resequencing rules and get them subtly wrong. A flat resource's
 * reorder endpoint is then ~15 lines:
 *
 *   $transaction(async (tx) => {
 *     await acquireAdvisoryLocks(tx, [lockKey('banners', null)]);
 *     await writeSiblingOrder(tx.banner, dto.orderedIds);
 *   });
 *
 * i.e. the degenerate one-bucket, reparent-free case of the tree contract — no cycle and
 * no depth guard, because a flat list has neither.
 *
 * NOTE (plan §3.1): the full-bucket rewrite writes one row at a time INSIDE a
 * transaction, so intermediate states legitimately contain duplicate
 * `(scope, sortOrder)` pairs. It is safe only because no `@@unique` touches `sortOrder`
 * on Category / Banner / BlogCategory / DeviceBrand / ProductGroup. Adding one would
 * break every reorder and force a two-phase negative-offset write.
 */

/** The root bucket has no parent row to key on — hence the sentinel. */
export const ROOT_BUCKET = '__root__';

/** The whole-tree bucket: taken by any write that changes a node's parent (§3.8). */
export const TREE_BUCKET = '__tree__';

/**
 * A namespaced Postgres advisory-lock key for ONE sibling bucket of `resource`.
 *
 * The `resource` prefix is MANDATORY: advisory locks are DATABASE-GLOBAL, and every
 * resource that reuses this recipe has a `__root__` bucket — without the prefix a banner
 * reorder would serialise against a root-category reorder.
 */
export function lockKey(resource: string, parentId: string | null): string {
  return `${resource}:${parentId ?? ROOT_BUCKET}`;
}

/**
 * The TREE-SCOPED advisory-lock key of `resource`.
 *
 * Cycle and depth are WHOLE-TREE invariants, and per-bucket locks do not serialise the
 * operations that violate them (two inverse reparents lock disjoint bucket sets and both
 * commit — textbook write skew, plan §3.8). Any write that changes a node's parent takes
 * this key. Flat resources never need it.
 */
export function treeLockKey(resource: string): string {
  return `${resource}:${TREE_BUCKET}`;
}

/** The subset of a Prisma client this module needs in order to take advisory locks. */
export interface AdvisoryLockClient {
  $executeRaw(query: TemplateStringsArray, ...values: unknown[]): Promise<number>;
}

/**
 * Take transaction-scoped advisory locks. Keys are de-duplicated and acquired in SORTED
 * order — that is what makes multi-key acquisition deadlock-free. The locks are released
 * automatically on COMMIT or ROLLBACK, never manually, so they cannot leak.
 *
 * Callers that need BOTH the tree key and bucket keys must acquire them in that order
 * (tree first, then the sorted buckets) — one call per group, not one merged sort.
 */
export async function acquireAdvisoryLocks(
  client: AdvisoryLockClient,
  keys: string[],
): Promise<void> {
  for (const key of [...new Set(keys)].sort()) {
    await client.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${key}::text, 0))`;
  }
}

/**
 * The subset of a Prisma model delegate this module needs. Structural on purpose — any
 * `tx.<model>` with a `sortOrder` column satisfies it, and the module stays free of any
 * concrete model import.
 */
export interface SortableDelegate {
  updateMany(args: {
    where: Record<string, unknown>;
    data: Record<string, unknown>;
  }): Promise<{ count: number }>;
}

/** One resolved row to write. `parentId` is present only for tree resources. */
export interface SortOrderWrite {
  id: string;
  sortOrder: number;
  parentId?: string | null;
}

/**
 * Apply already-resolved `sortOrder` (and, for a tree, `parentId`) writes.
 *
 * `updateMany` — NOT `update` — so a row that vanished concurrently is a silent no-op
 * rather than a `P2025` aborting an otherwise legal batch. Callers are expected to have
 * OMITTED rows that are already at their target, which avoids gratuitous `@updatedAt`
 * churn (the storefront sitemap's `lastModified` reads it).
 */
export async function applySortOrderWrites(
  delegate: SortableDelegate,
  writes: readonly SortOrderWrite[],
  scope: Record<string, unknown> = {},
): Promise<void> {
  for (const write of writes) {
    const data: Record<string, unknown> = { sortOrder: write.sortOrder };
    if (write.parentId !== undefined) data.parentId = write.parentId;

    await delegate.updateMany({ where: { id: write.id, ...scope }, data });
  }
}

/**
 * Rewrite ONE complete sibling bucket: the array index becomes `sortOrder` (0..n-1,
 * contiguous). The flat-resource entry point — the tree path resolves its writes through
 * `category-reorder.rules.ts` first (it must also assign `parentId` and skip no-ops) and
 * calls {@link applySortOrderWrites} directly.
 *
 * `orderedIds` MAY be empty — a bucket losing its last member is legal.
 *
 * `scope` is an extra WHERE guard (e.g. `{ productId }`), so an id forged from another
 * scope silently updates nothing instead of being stolen into this one.
 */
export function writeSiblingOrder(
  delegate: SortableDelegate,
  orderedIds: readonly string[],
  scope: Record<string, unknown> = {},
): Promise<void> {
  return applySortOrderWrites(
    delegate,
    orderedIds.map((id, index) => ({ id, sortOrder: index })),
    scope,
  );
}
