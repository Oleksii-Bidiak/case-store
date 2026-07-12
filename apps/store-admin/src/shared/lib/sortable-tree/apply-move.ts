/**
 * The single, measurement-free move reducer (plan 158 §3.2).
 *
 * EVERY move path in the feature funnels through `applyMove`:
 * - keyboard move mode / accelerators → `applyIntent` → `applyMove`
 * - pointer drag → dnd-kit `getProjection` → `projectionToInsertionPoint` → `applyMove`
 * - row "Дії" menu → `applyIntent` → `applyMove`
 * - "Перемістити до…" dialog → an `InsertionPoint` → `applyMove`
 *
 * That is what makes the jsdom keyboard tests meaningful for the (untestable in
 * jsdom) pointer path — the projection fixture-table test in `projection.test.ts`
 * asserts the two agree.
 *
 * Zero React, zero dnd-kit runtime, zero measurement.
 */

import {
  MAX_TREE_LEVELS,
  type InsertionPoint,
  type MoveIntent,
  type MoveOutcome,
  type TreeItem,
} from "./types";

const ROOT = "__root__";

const bucketKey = (parentId: string | null): string => parentId ?? ROOT;

/** Children of every bucket, in array order (array order IS sibling order). */
export function groupChildren(items: TreeItem[]): Map<string, TreeItem[]> {
  const map = new Map<string, TreeItem[]>();
  for (const item of items) {
    const key = bucketKey(item.parentId);
    const bucket = map.get(key);
    if (bucket) bucket.push(item);
    else map.set(key, [item]);
  }
  return map;
}

/** 1-based level of every item (a root is level 1). Cycle-safe. */
export function levelOf(items: TreeItem[]): Map<string, number> {
  const byId = new Map(items.map((i) => [i.id, i]));
  const levels = new Map<string, number>();

  const resolve = (id: string, seen: Set<string>): number => {
    const cached = levels.get(id);
    if (cached !== undefined) return cached;
    const item = byId.get(id);
    if (!item || item.parentId === null || seen.has(id)) {
      levels.set(id, 1);
      return 1;
    }
    seen.add(id);
    const level = resolve(item.parentId, seen) + 1;
    levels.set(id, level);
    return level;
  };

  for (const item of items) resolve(item.id, new Set());
  return levels;
}

/** Ids strictly below `id` (self excluded). */
export function descendantsOf(items: TreeItem[], id: string): Set<string> {
  const children = groupChildren(items);
  const out = new Set<string>();
  const stack = [id];
  while (stack.length > 0) {
    const current = stack.pop() as string;
    for (const child of children.get(bucketKey(current)) ?? []) {
      if (out.has(child.id)) continue;
      out.add(child.id);
      stack.push(child.id);
    }
  }
  return out;
}

/** Number of LEVELS in the subtree rooted at `id`, self included (a leaf = 1). */
export function subtreeHeight(items: TreeItem[], id: string): number {
  const children = groupChildren(items);
  const walk = (nodeId: string, seen: Set<string>): number => {
    if (seen.has(nodeId)) return 1;
    seen.add(nodeId);
    const kids = children.get(bucketKey(nodeId)) ?? [];
    if (kids.length === 0) return 1;
    return 1 + Math.max(...kids.map((k) => walk(k.id, seen)));
  };
  return walk(id, new Set());
}

/** Re-serialise the buckets into canonical depth-first order. */
function toDfsOrder(children: Map<string, TreeItem[]>): TreeItem[] {
  const out: TreeItem[] = [];
  const visit = (key: string, guard: Set<string>) => {
    for (const item of children.get(key) ?? []) {
      if (guard.has(item.id)) continue;
      guard.add(item.id);
      out.push(item);
      visit(bucketKey(item.id), guard);
    }
  };
  visit(ROOT, new Set());
  return out;
}

/**
 * Move `movingId` (with its whole subtree) to `point`.
 *
 * `targetIndex` is the 0-based slot in the destination bucket AFTER the moving
 * node has been removed from its old bucket (so a same-bucket "move down one"
 * is `currentIndex + 1`). Out-of-range indices are clamped.
 *
 * Returns `null` — refusing the move — when the node is unknown, when the target
 * parent is the node itself or one of its descendants (client-side mirror of the
 * server cycle guard), or when `level(target) + height(subtree) − 1 > maxLevels`
 * (plan §3.7).
 */
export function applyMove(
  items: TreeItem[],
  movingId: string,
  point: InsertionPoint,
  maxLevels: number = MAX_TREE_LEVELS,
): TreeItem[] | null {
  const moving = items.find((i) => i.id === movingId);
  if (!moving) return null;

  const { targetParentId } = point;
  if (targetParentId === movingId) return null;
  if (
    targetParentId !== null &&
    !items.some((i) => i.id === targetParentId) // unknown parent
  ) {
    return null;
  }
  if (
    targetParentId !== null &&
    descendantsOf(items, movingId).has(targetParentId)
  ) {
    return null;
  }

  const levels = levelOf(items);
  const targetLevel =
    targetParentId === null ? 1 : (levels.get(targetParentId) as number) + 1;
  const height = subtreeHeight(items, movingId);
  if (targetLevel + height - 1 > maxLevels) return null;

  const children = groupChildren(items);
  // Detach from the old bucket.
  const sourceKey = bucketKey(moving.parentId);
  const source = (children.get(sourceKey) ?? []).filter(
    (i) => i.id !== movingId,
  );
  children.set(sourceKey, source);

  // Insert into the destination bucket (the source list above is already the
  // post-removal one, so a same-bucket move reads its own updated array).
  const destKey = bucketKey(targetParentId);
  const dest = (children.get(destKey) ?? []).filter((i) => i.id !== movingId);
  const index = Math.max(0, Math.min(point.targetIndex, dest.length));
  const moved: TreeItem = { ...moving, parentId: targetParentId };
  dest.splice(index, 0, moved);
  children.set(destKey, dest);

  return toDfsOrder(children);
}

/**
 * Translate a keyboard / menu intent into an `InsertionPoint` and apply it.
 * Boundary conditions are reported as typed refusals (each maps to exactly one
 * `dict.reorderTree.announce.*` string, plan §7.3) rather than silently no-oping.
 */
export function applyIntent(
  items: TreeItem[],
  movingId: string,
  intent: MoveIntent,
  maxLevels: number = MAX_TREE_LEVELS,
): MoveOutcome {
  const moving = items.find((i) => i.id === movingId);
  if (!moving) return { kind: "refused", reason: "not-found" };

  const children = groupChildren(items);
  const siblings = children.get(bucketKey(moving.parentId)) ?? [];
  const index = siblings.findIndex((i) => i.id === movingId);
  const last = siblings.length - 1;

  let point: InsertionPoint;

  switch (intent) {
    case "up":
      if (index <= 0) return { kind: "refused", reason: "at-top" };
      point = { targetParentId: moving.parentId, targetIndex: index - 1 };
      break;
    case "down":
      if (index >= last) return { kind: "refused", reason: "at-bottom" };
      point = { targetParentId: moving.parentId, targetIndex: index + 1 };
      break;
    case "first":
      if (index <= 0) return { kind: "refused", reason: "at-top" };
      point = { targetParentId: moving.parentId, targetIndex: 0 };
      break;
    case "last":
      if (index >= last) return { kind: "refused", reason: "at-bottom" };
      // `last` is the post-removal length ⇒ append.
      point = { targetParentId: moving.parentId, targetIndex: last };
      break;
    case "indent": {
      const previous = siblings[index - 1];
      if (!previous) return { kind: "refused", reason: "no-previous-sibling" };
      const levels = levelOf(items);
      const targetLevel = (levels.get(previous.id) as number) + 1;
      if (targetLevel + subtreeHeight(items, movingId) - 1 > maxLevels) {
        return { kind: "refused", reason: "max-depth" };
      }
      const newSiblings = children.get(bucketKey(previous.id)) ?? [];
      point = {
        targetParentId: previous.id,
        targetIndex: newSiblings.length,
      };
      break;
    }
    case "outdent": {
      if (moving.parentId === null) {
        return { kind: "refused", reason: "at-root" };
      }
      const parent = items.find((i) => i.id === moving.parentId) as TreeItem;
      const uncles = children.get(bucketKey(parent.parentId)) ?? [];
      const parentIndex = uncles.findIndex((i) => i.id === parent.id);
      point = {
        targetParentId: parent.parentId,
        targetIndex: parentIndex + 1,
      };
      break;
    }
  }

  const next = applyMove(items, movingId, point, maxLevels);
  if (!next) return { kind: "refused", reason: "illegal-target" };
  return { kind: "moved", items: next, point };
}
