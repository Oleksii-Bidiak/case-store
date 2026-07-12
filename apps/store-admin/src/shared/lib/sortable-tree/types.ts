/**
 * Shared types for the sortable-tree primitive (plan 158 §3.2 / §4).
 *
 * Two representations live side by side and MUST NOT be confused:
 *
 * 1. `TreeItem` — our canonical, measurement-free model: a FLAT, ordered list of
 *    `{ id, parentId }`. Array order within a parent bucket IS the sibling order
 *    (it is what becomes `sortOrder` on the wire). Every pure operation
 *    (`applyMove`, `applyIntent`, `toReorderGroups`) consumes and produces this.
 *
 * 2. `FlattenedItem` — dnd-kit's SortableTree representation (`depth`, `index`,
 *    `children`), produced by the vendored `flattenTree`. It exists ONLY to feed
 *    the vendored `getProjection` on the pointer path and is immediately
 *    converted back to an insertion point by `projectionToInsertionPoint`.
 *
 * Depth conventions (easy to get wrong):
 * - `FlattenedItem.depth` is 0-BASED (dnd-kit's own convention; a root is 0).
 * - `maxLevels` / `level` in OUR code is 1-BASED (plan §3.7: a root category is
 *   level 1; the structural cap is `MAX_TREE_LEVELS = 4`).
 */

/** Structural cap, 1-based levels — mirrors `MAX_CATEGORY_TREE_LEVELS` in store-api. */
export const MAX_TREE_LEVELS = 4;

/** Canonical flat item. Array order == sibling order within a parent bucket. */
export interface TreeItem {
  id: string;
  /** `null` = root bucket. */
  parentId: string | null;
  label: string;
  /** Row cannot be picked up / moved (still rendered, still a valid neighbour). */
  disabled?: boolean;
}

/** dnd-kit SortableTree node (nested form) — only used by the vendored helpers. */
export interface NestedTreeItem {
  id: string;
  children: NestedTreeItem[];
}

/** dnd-kit SortableTree flattened node — 0-based `depth`. */
export interface FlattenedItem extends NestedTreeItem {
  parentId: string | null;
  depth: number;
  index: number;
}

/** dnd-kit `getProjection` output. `depth` is 0-BASED. */
export interface Projection {
  depth: number;
  maxDepth: number;
  minDepth: number;
  parentId: string | null;
}

/**
 * The ONE move currency of this feature. Pointer (via `projectionToInsertionPoint`),
 * keyboard (via `applyIntent`), the row menu and the "Перемістити до…" dialog all
 * produce this and feed it to the SAME `applyMove` reducer.
 */
export interface InsertionPoint {
  /** Destination bucket. `null` = root. */
  targetParentId: string | null;
  /** 0-based slot among the destination bucket's children, AFTER the move. */
  targetIndex: number;
}

/** Keyboard / menu move intents (plan §7.2). */
export type MoveIntent =
  | "up"
  | "down"
  | "indent"
  | "outdent"
  | "first"
  | "last";

/** Why a move was refused — maps 1:1 onto a `dict.reorderTree.announce.*` string. */
export type MoveRefusal =
  | "at-top"
  | "at-bottom"
  | "no-previous-sibling"
  | "max-depth"
  | "at-root"
  | "not-found"
  | "illegal-target";

export type MoveOutcome =
  | { kind: "moved"; items: TreeItem[]; point: InsertionPoint }
  | { kind: "refused"; reason: MoveRefusal };
