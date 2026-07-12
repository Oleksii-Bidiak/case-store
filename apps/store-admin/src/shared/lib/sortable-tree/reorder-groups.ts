/**
 * Diff two tree states into the wire payload (plan 158 §3.4).
 *
 * Contract of `PATCH /api/admin/categories/reorder`: the client sends the
 * COMPLETE, FINAL child list of every bucket it touched. A same-parent reorder
 * touches 1 bucket; a reparent touches 2 (source + destination). An EMPTY
 * `orderedIds` is legal and REQUIRED — a parent may lose its last child.
 *
 * The server independently recomputes the affected-parent closure, so emitting
 * only the changed buckets is safe; emitting an unchanged bucket would merely be
 * noise.
 */

import type { ReorderGroupDto } from "@/shared/api";
import { groupChildren } from "./apply-move";
import type { TreeItem } from "./types";

const ROOT = "__root__";
const toParentId = (key: string): string | null => (key === ROOT ? null : key);

/** Buckets whose ordered child-id list differs between `prev` and `next`. */
export function toReorderGroups(
  prev: TreeItem[],
  next: TreeItem[],
): ReorderGroupDto[] {
  const before = groupChildren(prev);
  const after = groupChildren(next);

  const keys = new Set<string>([...before.keys(), ...after.keys()]);
  const groups: ReorderGroupDto[] = [];

  for (const key of keys) {
    const prevIds = (before.get(key) ?? []).map((i) => i.id);
    const nextIds = (after.get(key) ?? []).map((i) => i.id);
    const changed =
      prevIds.length !== nextIds.length ||
      prevIds.some((id, i) => id !== nextIds[i]);
    if (!changed) continue;
    groups.push({ parentId: toParentId(key), orderedIds: nextIds });
  }

  return groups;
}
