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
 * One row of a bucket snapshot, as read inside the reorder transaction.
 *
 * `sortOrder` is OPTIONAL because the snapshot callbacks predate TASK-429 and most of them
 * still `select: { id: true }` — the validation in `assertFlatReorder` only ever needed the
 * ids. A caller that ALSO selects `sortOrder` opts its resource into no-op filtering (see
 * {@link resolveSiblingOrderWrites}); one that does not keeps the old full-bucket rewrite.
 * Absent is therefore "I don't know where this row currently sits", never "slot 0".
 */
export interface SiblingSnapshotRow {
  id: string;
  sortOrder?: number;
}

/**
 * Resolve which rows a full-bucket rewrite actually has to touch: `orderedIds` MINUS every
 * row the snapshot already shows sitting at its target index.
 *
 * WHY this exists (TASK-429, review finding #3). `sortOrder` writes go through Prisma
 * `update`/`updateMany`, and every sortable model stamps `updatedAt` via `@updatedAt`. So a
 * blind `orderedIds.map((id, index) => …)` rewrites — and re-stamps — the WHOLE bucket on
 * every drag, including the rows nobody moved. On `Page` that is user-visible, not
 * cosmetic: the storefront reads `updatedAt` as the document's revision date
 * (`sitemap.ts` → `lastModified`, and the «Оновлено …» line on `/legal` and every
 * `/legal/<slug>`). One drag in the admin list made the privacy policy, the terms and the
 * returns policy all claim they had been rewritten that day, and with no history column the
 * true dates were gone for good. The tree path never had the bug — `category-reorder.rules`
 * returns early on `row.sortOrder === index` — and this is the flat path's equivalent.
 *
 * Filtering is safe against the transient duplicate `(scope, sortOrder)` pairs the
 * one-row-at-a-time write produces (see the NOTE at the top of this file): the FINAL state
 * is still exactly `index → sortOrder` for the whole bucket, because a row is skipped only
 * when it is ALREADY at the value the write would have given it.
 *
 * Only the WRITE list is trimmed. `assertFlatReorder` still validates the payload against
 * the COMPLETE snapshot — dropping a no-op row from the validation would turn a partial,
 * lost-update payload into an accepted one.
 */
export function resolveSiblingOrderWrites(
  orderedIds: readonly string[],
  snapshot: readonly SiblingSnapshotRow[] = [],
): SortOrderWrite[] {
  const currentSlot = new Map<string, number>();
  for (const row of snapshot) {
    if (typeof row.sortOrder === 'number') currentSlot.set(row.id, row.sortOrder);
  }

  const writes: SortOrderWrite[] = [];
  orderedIds.forEach((id, index) => {
    if (currentSlot.get(id) === index) return;
    writes.push({ id, sortOrder: index });
  });

  return writes;
}

/**
 * Apply already-resolved `sortOrder` (and, for a tree, `parentId`) writes.
 *
 * `updateMany` — NOT `update` — so a row that vanished concurrently is a silent no-op
 * rather than a `P2025` aborting an otherwise legal batch. Callers are expected to have
 * OMITTED rows that are already at their target, which avoids gratuitous `@updatedAt`
 * churn (the storefront sitemap's `lastModified` reads it) — the tree path does that in
 * `category-reorder.rules.ts`, the flat path in {@link resolveSiblingOrderWrites}.
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
 *
 * `snapshot` is the bucket as it stands right now, read under the same advisory lock. When
 * its rows carry `sortOrder`, the rows already at their target index are NOT written
 * (TASK-429) — see {@link resolveSiblingOrderWrites} for why that matters. Omitting it (or
 * selecting only `id`) keeps the pre-TASK-429 full rewrite.
 */
export function writeSiblingOrder(
  delegate: SortableDelegate,
  orderedIds: readonly string[],
  scope: Record<string, unknown> = {},
  snapshot: readonly SiblingSnapshotRow[] = [],
): Promise<void> {
  return applySortOrderWrites(delegate, resolveSiblingOrderWrites(orderedIds, snapshot), scope);
}
