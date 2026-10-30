/**
 * A list with ONE global order, reordered one slice at a time (TASK-1990 —
 * static pages: `PATCH /pages/reorder` takes every page, but a hub renders only
 * its own kind, so the operator orders a kind view).
 *
 * The reordered slice is written back into the SLOTS its rows held in the full
 * order: every row outside the slice keeps its exact index, and the result
 * still names every id — the payload the server needs.
 *
 * `null` when `slice` is not a permutation of the full list's rows it names
 * (an unknown id, a duplicate, a missing row): there is no honest merge then,
 * and the caller sends nothing.
 */
export function mergeSliceOrder(
  fullIds: readonly string[],
  slice: readonly string[],
): string[] | null {
  const members = new Set(slice);
  if (members.size !== slice.length) return null;

  const slots: number[] = [];
  fullIds.forEach((id, index) => {
    if (members.has(id)) slots.push(index);
  });
  if (slots.length !== slice.length) return null;

  const merged = [...fullIds];
  slots.forEach((slot, i) => {
    merged[slot] = slice[i];
  });
  return merged;
}
