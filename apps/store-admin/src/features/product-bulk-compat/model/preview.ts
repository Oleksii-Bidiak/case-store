/**
 * What the bulk «Сумісність…» dialog says before anything is written (TASK-1955):
 * «Зараз у вибраних: …» and the preview line. Pure; computed from the selected
 * rows' current compat sets, which the admin list carries since TASK-1955.
 */

import type { BulkCompatMode } from "@/entities/device";

/** The slice of a product row the preview reads. */
export interface CompatRow {
  id: string;
  /** Absent on a row the list did not hydrate — read as "none". */
  compatibleDeviceModels?: ReadonlyArray<{ id: string; name: string }>;
}

/** «iPhone 14», «iPhone 14, iPhone 15», «iPhone 14, iPhone 15 +3». */
export function compatSetLabel(
  models: ReadonlyArray<{ name: string }>,
): string {
  const names = models.map((model) => model.name);
  const head = names.slice(0, 2).join(", ");
  return names.length > 2 ? `${head} +${names.length - 2}` : head;
}

export interface CurrentCompatGroups {
  /** Products with no compat at all. */
  none: number;
  /** Products sharing the same set, most common first (at most `limit`). */
  groups: Array<{ count: number; label: string }>;
  /** Products in the groups past `limit`. */
  more: number;
}

/**
 * Selected rows grouped by their current compat SET (same set = same group), so
 * «2 без сумісності, 1 — iPhone 14» can be said. At most `limit` groups are named
 * (counting «без сумісності» as one); the rest collapse into `more`.
 */
export function groupCurrentCompat(
  rows: readonly CompatRow[],
  limit = 3,
): CurrentCompatGroups {
  let none = 0;
  const bySet = new Map<string, { count: number; label: string }>();
  for (const row of rows) {
    if ((row.compatibleDeviceModels ?? []).length === 0) {
      none += 1;
      continue;
    }
    const sorted = [...(row.compatibleDeviceModels ?? [])].sort((a, b) =>
      a.name.localeCompare(b.name, "uk", { numeric: true }),
    );
    const key = sorted.map((model) => model.id).join("|");
    const entry = bySet.get(key) ?? { count: 0, label: compatSetLabel(sorted) };
    entry.count += 1;
    bySet.set(key, entry);
  }
  const ordered = [...bySet.values()].sort((a, b) => b.count - a.count);
  const room = Math.max(0, limit - (none > 0 ? 1 : 0));
  const groups = ordered.slice(0, room);
  const more = ordered.slice(room).reduce((sum, group) => sum + group.count, 0);
  return { none, groups, more };
}

/** Would `mode` with `modelIds` change this row? Mirrors the API's own test. */
export function rowChanges(
  mode: BulkCompatMode,
  row: CompatRow,
  modelIds: ReadonlySet<string>,
): boolean {
  const have = new Set(
    (row.compatibleDeviceModels ?? []).map((model) => model.id),
  );
  switch (mode) {
    case "add":
      return [...modelIds].some((id) => !have.has(id));
    case "remove":
      return [...modelIds].some((id) => have.has(id));
    case "replace":
      return (
        have.size !== modelIds.size || [...have].some((id) => !modelIds.has(id))
      );
  }
}

export interface CompatPreview {
  /** Rows the write would change. 0 ⇒ nothing to apply. */
  changed: number;
  /** For `add`: rows that already have compat, which stays. */
  keeping: CompatRow[];
}

export function previewCompat(
  mode: BulkCompatMode,
  rows: readonly CompatRow[],
  modelIds: ReadonlySet<string>,
): CompatPreview {
  return {
    changed: rows.filter((row) => rowChanges(mode, row, modelIds)).length,
    keeping:
      mode === "add"
        ? rows.filter((row) => (row.compatibleDeviceModels ?? []).length > 0)
        : [],
  };
}
