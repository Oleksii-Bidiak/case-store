import {
  CategoryCycleError,
  CategoryDuplicateIdError,
  CategoryMaxDepthError,
  CategoryNotFoundError,
  CategorySelfParentError,
  CategoryTreeStaleError,
} from './category.errors';

/**
 * PURE reorder/reparent rules for the category tree (plan 158 §3.6/§3.7).
 *
 * This module has NO Prisma import and NO Nest DI: it is the single source of truth
 * for the batch guards, executed by `CategoryRepository.applyTreeMoves` INSIDE the
 * advisory-locked transaction (so the guards see the batch's own uncommitted moves)
 * and unit-tested in milliseconds. It throws domain errors from `category.errors.ts`;
 * mapping them to HTTP is the service layer's job.
 */

/**
 * Structural depth cap, 1-BASED: a root category is level 1.
 *
 * Both tree reads are `findMany(roots)` + THREE nested `include: { children }`, i.e.
 * they materialise four tiers — level 4 IS returned, level 5 is the first tier the
 * public tree silently drops. The rule enforced for every moved node is therefore
 * `level(node) + height(subtree(node)) - 1 <= MAX_CATEGORY_TREE_LEVELS`, where
 * `height` counts levels INCLUDING the node itself (a leaf has height 1). Capping the
 * moved node's own level alone would let a 2-level subtree dragged under a level-3
 * node push its grandchildren to level 5, invisible to storefront AND admin.
 */
export const MAX_CATEGORY_TREE_LEVELS = 4;

/** One row of the full-table, in-transaction snapshot. */
export interface CategorySnapshotRow {
  id: string;
  parentId: string | null;
  sortOrder: number;
}

/**
 * The structural shape of one payload bucket. `ReorderGroupDto` (a class-validator DTO
 * added in TASK-291-E) satisfies it structurally, so this pure module never imports it.
 */
export interface ReorderGroupInput {
  /** `null` = the root bucket. */
  parentId: string | null;
  /** The COMPLETE, FINAL child list of the bucket. MAY be empty. */
  orderedIds: string[];
}

/** A single row the repository must write. Rows already at target are never emitted. */
export interface ResolvedWrite {
  id: string;
  parentId: string | null;
  sortOrder: number;
}

/** Root-bucket sentinel — `null` cannot be a Map key alongside string ids safely. */
const ROOT = '__root__';

const bucketKey = (parentId: string | null): string => parentId ?? ROOT;

/**
 * Validate a batch reorder/reparent payload against a full-table snapshot and resolve
 * the exact rows to write.
 *
 * Guards run in this order (plan §3.7 — the order is load-bearing: the cycle walk must
 * precede the depth walk, which cannot terminate on a cyclic graph):
 * duplicate id -> unknown id/parent -> self-parent -> post-batch cycle -> depth -> staleness.
 *
 * The AFFECTED-PARENT CLOSURE is computed here, not trusted from the payload: it is
 * (every `group.parentId`) union (the CURRENT parent of every id named in any group).
 * A bucket in the closure the client did NOT describe is still resequenced to a
 * contiguous 0..n-1, so an incomplete payload can never leave a hole.
 *
 * @param snapshot the WHOLE `category` table (never filtered — a filtered snapshot makes
 *   the multi-move cycle walk and the depth check uncomputable)
 * @param groups the payload buckets
 * @returns the rows whose `(parentId, sortOrder)` actually changes
 */
export function validateAndResolveReorder(
  snapshot: CategorySnapshotRow[],
  groups: ReorderGroupInput[],
): ResolvedWrite[] {
  const rowById = new Map<string, CategorySnapshotRow>(snapshot.map((row) => [row.id, row]));

  assertNoDuplicateIds(groups);
  assertAllIdsKnown(rowById, groups);
  assertNoSelfParent(groups);

  // Post-batch parent map = committed parentage overlaid with the batch's assignments.
  const parentById = new Map<string, string | null>(
    snapshot.map((row) => [row.id, row.parentId] as const),
  );
  const movedIds: string[] = [];
  for (const grp of groups) {
    for (const id of grp.orderedIds) {
      if (parentById.get(id) !== grp.parentId) movedIds.push(id);
      parentById.set(id, grp.parentId);
    }
  }

  assertNoCycles(parentById, movedIds);

  const childrenByParent = buildChildrenIndex(parentById);
  for (const id of movedIds) {
    assertDepthWithinCap(parentById, childrenByParent, id);
  }

  // Affected-parent closure: described buckets + the CURRENT bucket of every named id.
  const closure = new Set<string | null>();
  for (const grp of groups) closure.add(grp.parentId);
  for (const grp of groups) {
    for (const id of grp.orderedIds) {
      closure.add(rowById.get(id)?.parentId ?? null);
    }
  }

  const describedByParent = new Map<string | null, string[]>(
    groups.map((grp) => [grp.parentId, grp.orderedIds]),
  );

  const writes: ResolvedWrite[] = [];
  for (const parentId of closure) {
    const members = childrenByParent.get(bucketKey(parentId)) ?? [];
    const described = describedByParent.get(parentId);

    if (described) {
      assertBucketNotStale(parentId, described, members);
    }

    // Described buckets keep the client's order; omitted closure buckets are
    // re-densified from their snapshot order (with the {id: 'asc'} tiebreaker).
    const ordered = described ?? sortBySnapshot(members, rowById);

    ordered.forEach((id, index) => {
      const row = rowById.get(id);
      if (row && row.parentId === parentId && row.sortOrder === index) return; // already at target
      writes.push({ id, parentId, sortOrder: index });
    });
  }

  return writes;
}

/**
 * Assert that moving `nodeId` under `newParentId` keeps its whole subtree within
 * {@link MAX_CATEGORY_TREE_LEVELS}. Reused by `CategoryService.update`'s parent-change
 * path (plan §3.10.3), which moves a single node rather than a batch.
 *
 * @throws CategoryMaxDepthError
 */
export function assertMoveDepth(
  snapshot: CategorySnapshotRow[],
  nodeId: string,
  newParentId: string | null,
): void {
  const parentById = new Map<string, string | null>(
    snapshot.map((row) => [row.id, row.parentId] as const),
  );
  parentById.set(nodeId, newParentId);

  assertDepthWithinCap(parentById, buildChildrenIndex(parentById), nodeId);
}

function assertNoDuplicateIds(groups: ReorderGroupInput[]): void {
  const seen = new Set<string>();
  for (const grp of groups) {
    for (const id of grp.orderedIds) {
      if (seen.has(id)) {
        throw new CategoryDuplicateIdError(
          `Category "${id}" appears more than once in the payload`,
        );
      }
      seen.add(id);
    }
  }
}

function assertAllIdsKnown(
  rowById: Map<string, CategorySnapshotRow>,
  groups: ReorderGroupInput[],
): void {
  for (const grp of groups) {
    if (grp.parentId !== null && !rowById.has(grp.parentId)) {
      throw new CategoryNotFoundError(`Parent category "${grp.parentId}" not found`);
    }
    for (const id of grp.orderedIds) {
      if (!rowById.has(id)) {
        throw new CategoryNotFoundError(`Category "${id}" not found`);
      }
    }
  }
}

function assertNoSelfParent(groups: ReorderGroupInput[]): void {
  for (const grp of groups) {
    if (grp.parentId !== null && grp.orderedIds.includes(grp.parentId)) {
      throw new CategorySelfParentError(`Category "${grp.parentId}" cannot be its own parent`);
    }
  }
}

/**
 * Walk each moved node's post-batch ancestor chain with a visited set. This is the ONLY
 * guard that catches a MULTI-MOVE cycle (A under B and B under A in one payload): each
 * such move is individually legal against the committed graph, so a per-move DB check
 * (`findDescendantIds`, which reads COMMITTED state) passes both and would commit a cycle.
 */
function assertNoCycles(parentById: Map<string, string | null>, movedIds: string[]): void {
  for (const startId of movedIds) {
    const seen = new Set<string>([startId]);
    let current = parentById.get(startId) ?? null;

    while (current !== null) {
      if (seen.has(current)) {
        throw new CategoryCycleError(
          `Moving category "${startId}" would create a circular reference`,
        );
      }
      seen.add(current);
      current = parentById.get(current) ?? null;
    }
  }
}

function buildChildrenIndex(parentById: Map<string, string | null>): Map<string, string[]> {
  const childrenByParent = new Map<string, string[]>();
  for (const [id, parentId] of parentById) {
    const key = bucketKey(parentId);
    const bucket = childrenByParent.get(key);
    if (bucket) bucket.push(id);
    else childrenByParent.set(key, [id]);
  }
  return childrenByParent;
}

/** `level(node) + height(subtree(node)) - 1 <= MAX_CATEGORY_TREE_LEVELS`. */
function assertDepthWithinCap(
  parentById: Map<string, string | null>,
  childrenByParent: Map<string, string[]>,
  nodeId: string,
): void {
  const level = levelOf(parentById, nodeId);
  const height = heightOf(childrenByParent, nodeId);

  if (level + height - 1 > MAX_CATEGORY_TREE_LEVELS) {
    throw new CategoryMaxDepthError(
      `Category "${nodeId}" would place its subtree at level ${level + height - 1}, ` +
        `exceeding the limit of ${MAX_CATEGORY_TREE_LEVELS}`,
    );
  }
}

/** 1-based: a root category is level 1. Assumes the graph is already cycle-free. */
function levelOf(parentById: Map<string, string | null>, nodeId: string): number {
  let level = 1;
  let current = parentById.get(nodeId) ?? null;
  while (current !== null) {
    level += 1;
    current = parentById.get(current) ?? null;
  }
  return level;
}

/** Levels INCLUDING the node itself (a leaf has height 1). Assumes a cycle-free graph. */
function heightOf(childrenByParent: Map<string, string[]>, nodeId: string): number {
  const children = childrenByParent.get(nodeId) ?? [];
  let height = 1;
  for (const childId of children) {
    height = Math.max(height, 1 + heightOf(childrenByParent, childId));
  }
  return height;
}

/**
 * A DESCRIBED bucket's `orderedIds` SET must equal its post-batch child SET. This is the
 * version-column-free optimistic-concurrency check: two concurrent PURE reorders of one
 * bucket have identical member sets (NOT stale — last-writer-wins), while a concurrent
 * reparent into/out of a described bucket changes its membership and yields a 409.
 */
function assertBucketNotStale(
  parentId: string | null,
  described: string[],
  members: string[],
): void {
  const memberSet = new Set(members);
  const isSameSet =
    described.length === memberSet.size && described.every((id) => memberSet.has(id));

  if (!isSameSet) {
    throw new CategoryTreeStaleError(
      `The children of bucket "${bucketKey(parentId)}" changed since the tree was loaded`,
    );
  }
}

/** Snapshot order with the `{ sortOrder: 'asc' }, { id: 'asc' }` tiebreaker (plan §3.9). */
function sortBySnapshot(ids: string[], rowById: Map<string, CategorySnapshotRow>): string[] {
  return [...ids].sort((x, y) => {
    const left = rowById.get(x);
    const right = rowById.get(y);
    const bySortOrder = (left?.sortOrder ?? 0) - (right?.sortOrder ?? 0);
    return bySortOrder !== 0 ? bySortOrder : x.localeCompare(y);
  });
}
