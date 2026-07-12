/**
 * Pointer-path adapter (plan 158 §3.2).
 *
 * dnd-kit's `getProjection` speaks (depth, parentId) over a flattened row list.
 * The reducer speaks `{ targetParentId, targetIndex }`. This module is the ONLY
 * bridge between them — it is what lets the pointer path reuse `applyMove`
 * verbatim, and `projection.test.ts` pins the equivalence over a fixture table.
 */

import { subtreeHeight } from "./apply-move";
import { arrayMove } from "./vendor-tree-utilities";
import {
  MAX_TREE_LEVELS,
  type FlattenedItem,
  type InsertionPoint,
  type NestedTreeItem,
  type Projection,
  type TreeItem,
} from "./types";

/**
 * The ABSOLUTE 0-based depth cap to hand `getProjection` while `activeId` is being
 * dragged, so the pointer can never project a drop `applyMove` would refuse.
 *
 * `level + height − 1 ≤ maxLevels` (plan §3.7) ⇒ `level ≤ maxLevels − height + 1`
 * ⇒ 0-based `depth ≤ maxLevels − height`.
 *
 * A `maxLevels` of 1 (the flat-list mode of the UI primitive) always yields 0 —
 * depth projection becomes unreachable and the tree collapses to a flat sortable
 * list.
 */
export function depthClampFor(
  items: TreeItem[],
  activeId: string,
  maxLevels: number = MAX_TREE_LEVELS,
): number {
  return Math.max(0, maxLevels - subtreeHeight(items, activeId));
}

/**
 * Canonical flat `TreeItem[]` → dnd-kit's NESTED shape (input to `flattenTree`).
 * Array order is preserved, so `flattenTree(toNested(items))` yields the visible
 * row order with dnd-kit's 0-based `depth`/`index` fields attached.
 */
export function toNested(items: TreeItem[]): NestedTreeItem[] {
  const nodes = new Map<string, NestedTreeItem>(
    items.map((i) => [i.id, { id: i.id, children: [] }]),
  );
  const roots: NestedTreeItem[] = [];
  for (const item of items) {
    const node = nodes.get(item.id) as NestedTreeItem;
    const parent = item.parentId ? nodes.get(item.parentId) : undefined;
    if (parent) parent.children.push(node);
    else roots.push(node);
  }
  return roots;
}

/**
 * Convert a dnd-kit projection into the reducer's insertion point.
 *
 * @param items  The SAME flattened list `getProjection` was called with — i.e.
 *               with the active item's descendants removed (`removeChildrenOf`).
 *               Required: an insertion INDEX cannot be derived from the
 *               projection alone (the projection only carries depth + parent).
 *
 * The index is computed exactly the way the dnd-kit example's
 * `arrayMove(...) → buildTree(...)` would place the row: move the active row to
 * the `over` slot, then count how many rows before it already belong to the
 * projected parent bucket.
 */
export function projectionToInsertionPoint(
  items: FlattenedItem[],
  activeId: string,
  overId: string,
  projection: Pick<Projection, "parentId">,
): InsertionPoint {
  const activeIndex = items.findIndex(({ id }) => id === activeId);
  const overIndex = items.findIndex(({ id }) => id === overId);
  if (activeIndex === -1 || overIndex === -1) {
    return { targetParentId: projection.parentId, targetIndex: 0 };
  }

  const sorted = arrayMove(items, activeIndex, overIndex);
  const targetParentId = projection.parentId;

  let targetIndex = 0;
  for (let i = 0; i < overIndex; i += 1) {
    const row = sorted[i];
    if (row.id === activeId) continue;
    if (row.parentId === targetParentId) targetIndex += 1;
  }

  return { targetParentId, targetIndex };
}
