/**
 * Per-resource "a reorder PATCH is in flight" flag (plan 158 §5, TASK-291-I;
 * keyed per resource in TASK-295).
 *
 * A reorder's mutation lifecycle requires that NO sibling mutation invalidates
 * THAT list's query while a move is being saved — an invalidation mid-move would
 * refetch the PRE-move server state and fight the optimistic override.
 *
 * The counter is KEYED BY RESOURCE. A single global counter was a real bug: a
 * banner reorder would make `isReorderInFlight()` true for a concurrent category
 * status toggle, which would then skip its admin-tree invalidation and leave the
 * category treegrid stale until a hard reload. Resources are independent lists;
 * their locks must be too.
 *
 * The readers (`features/category-status-toggle`) and the writers
 * (`features/category-tree-reorder`, `features/list-reorder`) are different FSD
 * slices of the same layer, and a feature may not import another feature. The
 * flag therefore lives in `shared/` — the only layer both may depend on.
 *
 * Deliberately NOT React state: it is read inside a mutation `onSuccess`
 * callback (outside render) and must be correct synchronously.
 */

/** The lists that can be reordered. One counter per bucket-owning resource. */
export type ReorderResource =
  | "categories"
  | "banners"
  | "blog-categories"
  | "device-brands";

const inFlight = new Map<ReorderResource, number>();

/** Mark a reorder PATCH on `resource` as started. Balanced by `endReorder()`. */
export function beginReorder(resource: ReorderResource): void {
  inFlight.set(resource, (inFlight.get(resource) ?? 0) + 1);
}

/** Mark a reorder PATCH on `resource` as settled (success OR error). */
export function endReorder(resource: ReorderResource): void {
  const next = (inFlight.get(resource) ?? 0) - 1;
  if (next <= 0) inFlight.delete(resource);
  else inFlight.set(resource, next);
}

/** True while at least one reorder PATCH on `resource` is in flight. */
export function isReorderInFlight(resource: ReorderResource): boolean {
  return (inFlight.get(resource) ?? 0) > 0;
}

/** Test-only escape hatch: drop any leaked counts between cases. */
export function resetReorderLock(): void {
  inFlight.clear();
}
