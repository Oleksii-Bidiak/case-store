/**
 * Module-level "a reorder PATCH is in flight" flag (plan 158 §5, TASK-291-I).
 *
 * The tree's mutation lifecycle requires that NO sibling mutation invalidates
 * the admin-tree query while a move is being saved — an invalidation mid-move
 * would refetch the PRE-move server tree and fight the optimistic override.
 *
 * The reader (`features/category-status-toggle`) and the writer
 * (`features/category-tree-reorder`) are two different FSD slices of the same
 * layer, and a feature may not import another feature. The flag therefore lives
 * in `shared/` — the only layer both may depend on.
 *
 * Deliberately NOT React state: it is read inside a mutation `onSuccess`
 * callback (outside render) and must be correct synchronously.
 */

let inFlight = 0;

/** Mark a reorder PATCH as started. Balanced by `endReorder()`. */
export function beginReorder(): void {
  inFlight += 1;
}

/** Mark a reorder PATCH as settled (success OR error). */
export function endReorder(): void {
  inFlight = Math.max(0, inFlight - 1);
}

/** True while at least one reorder PATCH is in flight. */
export function isReorderInFlight(): boolean {
  return inFlight > 0;
}

/** Test-only escape hatch: drop any leaked counts between cases. */
export function resetReorderLock(): void {
  inFlight = 0;
}
