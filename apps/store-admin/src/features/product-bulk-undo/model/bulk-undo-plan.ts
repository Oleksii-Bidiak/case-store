import { readColorAxis } from "@/shared/lib/color-axis";

/** The three bulk writes on the product list that can be taken back. */
export type BulkUndoKind = "status" | "group" | "color";

/** The value each kind writes: `isActive`, `groupId`, colour. */
export type BulkUndoValue<K extends BulkUndoKind> = K extends "status"
  ? boolean
  : string | null;

/** One replay request: set `value` on exactly these ids. */
export interface BulkUndoStep<K extends BulkUndoKind = BulkUndoKind> {
  value: BulkUndoValue<K>;
  ids: string[];
}

export interface BulkUndoPlan<K extends BulkUndoKind = BulkUndoKind> {
  kind: K;
  steps: BulkUndoStep<K>[];
}

/** The fields of a list row the snapshot reads. */
export interface BulkUndoRow {
  id: string;
  isActive: boolean;
  groupId?: string | null;
  attributes?: unknown;
}

function previousValue(
  kind: BulkUndoKind,
  row: BulkUndoRow,
): boolean | string | null {
  switch (kind) {
    case "status":
      return row.isActive;
    case "group":
      return row.groupId ?? null;
    case "color":
      return readColorAxis(row.attributes);
  }
}

function normalise(
  kind: BulkUndoKind,
  value: boolean | string | null,
): boolean | string | null {
  return kind === "color" && typeof value === "string" ? value.trim() : value;
}

/**
 * Build the inverse of a bulk write BEFORE it runs (TASK-837).
 *
 * The rows are read off the page the operator is looking at — the same objects
 * the selection was made from — and grouped by their PREVIOUS value, because the
 * only undo the API offers is the forward endpoint itself: «put these back to
 * X» is one `PATCH /products/{status,group,color}` per distinct X. Rows that
 * already held the new value are left out: nothing changed for them, so there
 * is nothing to put back, and a write would only bump `updatedAt`.
 *
 * Returns `null` when no selected row would change — there is nothing to undo,
 * so the panel should not offer to.
 *
 * Ids missing from `rows` are skipped rather than guessed at: the selection is
 * page-scoped (`useRowSelection`), so this only happens if the list refetched
 * between the click and the snapshot, and inventing a previous value would be
 * worse than not restoring one.
 */
export function buildBulkUndoPlan<K extends BulkUndoKind>(
  kind: K,
  ids: readonly string[],
  rows: readonly BulkUndoRow[],
  nextValue: BulkUndoValue<K>,
): BulkUndoPlan<K> | null {
  const byId = new Map(rows.map((row) => [row.id, row]));
  const next = normalise(kind, nextValue);
  // Map keys keep insertion order, so the replay order is stable and testable.
  const groups = new Map<boolean | string | null, string[]>();

  for (const id of ids) {
    const row = byId.get(id);
    if (!row) continue;
    const previous = previousValue(kind, row);
    if (previous === next) continue;
    const bucket = groups.get(previous);
    if (bucket) bucket.push(id);
    else groups.set(previous, [id]);
  }

  if (groups.size === 0) return null;
  return {
    kind,
    steps: [...groups].map(([value, stepIds]) => ({
      value: value as BulkUndoValue<K>,
      ids: stepIds,
    })),
  };
}

/** How many products an undo plan touches. */
export function countPlanIds(plan: BulkUndoPlan): number {
  return plan.steps.reduce((sum, step) => sum + step.ids.length, 0);
}
