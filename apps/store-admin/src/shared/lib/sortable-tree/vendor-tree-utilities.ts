/**
 * Vendored from the dnd-kit SortableTree example
 * (https://github.com/clauderic/dnd-kit — `stories/3 - Examples/Tree/utilities.ts`).
 *
 * MIT License
 *
 * Copyright (c) 2021, Claudéric Demers
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 * SOFTWARE.
 *
 * ---------------------------------------------------------------------------
 * Vendored subset: `flattenTree`, `buildTree`, `getProjection`, `removeChildrenOf`.
 *
 * `sortableTreeKeyboardCoordinates` is DELIBERATELY NOT vendored and no
 * `KeyboardSensor` is registered anywhere (plan 158 §3.2): dnd-kit's sensors are
 * driven by measured `droppableRects`, and jsdom's `getBoundingClientRect()`
 * returns zeros — routing the keyboard through dnd-kit would leave the whole
 * keyboard-a11y acceptance criterion untestable. The keyboard path is owned
 * in-repo (`apply-move.ts`).
 *
 * Adaptations (kept minimal, all documented):
 * - ids are `string` (not dnd-kit's `UniqueIdentifier`) and `arrayMove` is
 *   re-implemented locally, so this module stays dependency-free and React-free
 *   (plan §8: `shared/lib/sortable-tree/` is pure).
 * - `getProjection` gains an OPTIONAL absolute `maxDepth` clamp (0-based) so the
 *   pointer path can never project a depth the `applyMove` reducer would refuse
 *   (`maxDepth: 1` in the UI primitive ⇒ clamp 0 ⇒ a flat sortable list).
 */

import type { FlattenedItem, NestedTreeItem, Projection } from "./types";

/** Local `arrayMove` (identical semantics to `@dnd-kit/sortable`'s). */
export function arrayMove<T>(array: T[], from: number, to: number): T[] {
  const next = array.slice();
  next.splice(to < 0 ? next.length + to : to, 0, next.splice(from, 1)[0]);
  return next;
}

function getDragDepth(offset: number, indentationWidth: number): number {
  return Math.round(offset / indentationWidth);
}

function getMaxDepth({
  previousItem,
}: {
  previousItem: FlattenedItem | undefined;
}): number {
  if (previousItem) {
    return previousItem.depth + 1;
  }
  return 0;
}

function getMinDepth({
  nextItem,
}: {
  nextItem: FlattenedItem | undefined;
}): number {
  if (nextItem) {
    return nextItem.depth;
  }
  return 0;
}

/**
 * Project the drop depth + parent from the horizontal drag offset.
 *
 * @param items          Flattened, VISIBLE rows with the active item's children
 *                       already removed (`removeChildrenOf([activeId])`).
 * @param maxDepthClamp  Optional ABSOLUTE 0-based depth cap (our addition).
 */
export function getProjection(
  items: FlattenedItem[],
  activeId: string,
  overId: string,
  dragOffset: number,
  indentationWidth: number,
  maxDepthClamp?: number,
): Projection {
  const overItemIndex = items.findIndex(({ id }) => id === overId);
  const activeItemIndex = items.findIndex(({ id }) => id === activeId);
  const activeItem = items[activeItemIndex];
  const newItems = arrayMove(items, activeItemIndex, overItemIndex);
  const previousItem = newItems[overItemIndex - 1];
  const nextItem = newItems[overItemIndex + 1];
  const dragDepth = getDragDepth(dragOffset, indentationWidth);
  const projectedDepth = (activeItem?.depth ?? 0) + dragDepth;
  const rawMaxDepth = getMaxDepth({ previousItem });
  const maxDepth =
    maxDepthClamp === undefined
      ? rawMaxDepth
      : Math.min(rawMaxDepth, maxDepthClamp);
  const minDepth = getMinDepth({ nextItem });
  let depth = projectedDepth;

  if (projectedDepth >= maxDepth) {
    depth = maxDepth;
  } else if (projectedDepth < minDepth) {
    depth = minDepth;
  }
  // With an absolute clamp, `minDepth` (derived from the NEXT row) can still
  // exceed it — the clamp wins, otherwise a flat list could project depth > 0.
  if (maxDepthClamp !== undefined && depth > maxDepthClamp) {
    depth = maxDepthClamp;
  }

  return { depth, maxDepth, minDepth, parentId: getParentId() };

  function getParentId(): string | null {
    if (depth === 0 || !previousItem) {
      return null;
    }
    if (depth === previousItem.depth) {
      return previousItem.parentId;
    }
    if (depth > previousItem.depth) {
      return previousItem.id;
    }
    const newParent = newItems
      .slice(0, overItemIndex)
      .reverse()
      .find((item) => item.depth === depth)?.parentId;

    return newParent ?? null;
  }
}

function flatten(
  items: NestedTreeItem[],
  parentId: string | null = null,
  depth = 0,
): FlattenedItem[] {
  return items.reduce<FlattenedItem[]>((acc, item, index) => {
    return [
      ...acc,
      { ...item, parentId, depth, index },
      ...flatten(item.children, item.id, depth + 1),
    ];
  }, []);
}

export function flattenTree(items: NestedTreeItem[]): FlattenedItem[] {
  return flatten(items);
}

export function buildTree(flattenedItems: FlattenedItem[]): NestedTreeItem[] {
  const root: NestedTreeItem = { id: "root", children: [] };
  const nodes: Record<string, NestedTreeItem> = { [root.id]: root };
  const items = flattenedItems.map((item) => ({ ...item, children: [] }));

  for (const item of items) {
    const { id, children } = item;
    const parentId = item.parentId ?? root.id;
    const parent = nodes[parentId] ?? findItem(items, parentId);

    nodes[id] = { id, children };
    parent?.children.push(item);
  }

  return root.children;
}

export function findItem(
  items: NestedTreeItem[],
  itemId: string,
): NestedTreeItem | undefined {
  return items.find(({ id }) => id === itemId);
}

export function removeChildrenOf(
  items: FlattenedItem[],
  ids: string[],
): FlattenedItem[] {
  const excludeParentIds = [...ids];

  return items.filter((item) => {
    if (item.parentId && excludeParentIds.includes(item.parentId)) {
      if (item.children.length) {
        excludeParentIds.push(item.id);
      }
      return false;
    }
    return true;
  });
}
