/**
 * The FLAT lists' half of the reorder lifecycle contract (TASK-295): the wire
 * payload helper, the `REORDER_*` error table and the announcements.
 *
 * Identical for banners, blog categories and device brands — the three endpoints
 * share ONE error-code family (`common/reorder/reorder.errors.ts`) and one
 * noun-free string namespace (`dict.reorderList`), so they share one adapter
 * surface here rather than three copies of the same switch.
 */

import type { TreeItem } from "@/shared/lib/sortable-tree";
import { dict } from "@/shared/config";
import type { ReorderLifecycleStrings } from "./use-reorder-lifecycle";

const a = dict.reorderList.announce;
const rejected = dict.reorderList.rejected;

/** 1-based position of `id` in a flat list. */
function positionOf(items: TreeItem[], id: string) {
  const at = items.findIndex((i) => i.id === id);
  if (at === -1) return null;
  return { name: items[at].label, pos: at + 1, size: items.length };
}

/**
 * The COMPLETE ordering of the bucket — or `null` when nothing moved (no request).
 *
 * Every id in the list is named, always: the server treats a payload that does not
 * name every row in the bucket as a lost update and 409s. This is why a filtered
 * list must not be reorderable, and why the banner grid reads the UNFILTERED list.
 */
export function orderedIdsIfChanged(
  from: TreeItem[],
  to: TreeItem[],
): string[] | null {
  const next = to.map((i) => i.id);
  const prev = from.map((i) => i.id);
  const same =
    prev.length === next.length && prev.every((id, i) => id === next[i]);
  return same ? null : next;
}

/** HTTP 409 — or the stale code, whatever status carried it. */
export function isFlatReorderConflict(
  status: number | undefined,
  code: string | undefined,
): boolean {
  return status === 409 || code === "REORDER_STALE";
}

/** The announcements + error table every flat sortable list speaks. */
export const flatReorderStrings: ReorderLifecycleStrings = {
  saving: a.saving,
  busyRefused: a.busyRefused,
  undone: a.undone,
  conflict: rejected.REORDER_STALE,

  rejected: ({ code, movingId, before }) => {
    const name = before.find((i) => i.id === movingId)?.label ?? "";
    switch (code) {
      case "REORDER_DUPLICATE_ID":
        return rejected.REORDER_DUPLICATE_ID(name);
      case "REORDER_NOT_FOUND":
        return rejected.REORDER_NOT_FOUND(name);
      case undefined:
      case "":
        // No coded body at all ⇒ network / 500.
        return dict.reorderList.saveFailed(name);
      default:
        // A code we do not recognise. NEVER announce a raw backend string and
        // NEVER leave the region empty.
        return dict.reorderList.rejectedUnknown(name);
    }
  },

  committed: (prev, next, movingId) => {
    const from = positionOf(prev, movingId);
    const to = positionOf(next, movingId);
    if (!from || !to) return null;
    return a.committed(to.name, to.pos, to.size, from.pos, from.size);
  },

  positionAfterConflict: (fresh, movingId) => {
    const at = positionOf(fresh, movingId);
    return at ? a.positionAfterConflict(at.name, at.pos, at.size) : null;
  },
};
