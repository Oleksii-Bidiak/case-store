// Pure sortable-tree algorithms (plan 158 §3.2/§8) — zero React, zero measurement.
export {
  MAX_TREE_LEVELS,
  type FlattenedItem,
  type InsertionPoint,
  type MoveIntent,
  type MoveOutcome,
  type MoveRefusal,
  type NestedTreeItem,
  type Projection,
  type TreeItem,
} from "./types";
export {
  applyIntent,
  applyMove,
  descendantsOf,
  groupChildren,
  levelOf,
  subtreeHeight,
} from "./apply-move";
export {
  depthClampFor,
  projectionToInsertionPoint,
  toNested,
} from "./projection";
export { toReorderGroups } from "./reorder-groups";
export {
  arrayMove,
  buildTree,
  flattenTree,
  getProjection,
  removeChildrenOf,
} from "./vendor-tree-utilities";
