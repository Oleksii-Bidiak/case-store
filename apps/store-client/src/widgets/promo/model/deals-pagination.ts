/**
 * Pure pagination helpers for the promo «Товари зі знижкою» load-more (TASK-179).
 *
 * Deliberately LOCAL to the promo widget and duplicated from
 * `widgets/product-list/model/load-more.ts` rather than cross-imported: FSD
 * forbids one widget reaching into a sibling widget's `model/` (same precedent
 * as plan 130's mirrored `resolve-seo-preview.ts`). Only the two shapes the
 * promo grid needs are kept — unlike the catalog, the promo grid has no
 * URL-anchored base page, so page 1 is always the base and appended pages are
 * pure client state keyed on the active category tab.
 */

/**
 * Merge the base page plus appended pages into one list, preserving page order
 * and deduplicating by `id`. Pages still in flight are passed as `undefined`
 * and skipped. Dedup guards against a product shifting page boundaries between
 * fetches.
 */
export function mergeDealPages<T extends { id: string }>(
  pages: (T[] | undefined)[],
): T[] {
  const seen = new Set<string>();
  const merged: T[] = [];
  for (const page of pages) {
    if (!page) continue;
    for (const item of page) {
      if (!seen.has(item.id)) {
        seen.add(item.id);
        merged.push(item);
      }
    }
  }
  return merged;
}

/** Whether another page can be appended after `loadedPages` of `totalPages`. */
export function canLoadMoreDeals(
  loadedPages: number,
  totalPages: number,
): boolean {
  return loadedPages < totalPages;
}

/**
 * How many items the NEXT append will add (drives the «Показати ще N» label):
 * a full `limit` for interior pages, the remainder on the final page, zero when
 * everything after `loadedPages` is exhausted or inputs are degenerate.
 */
export function nextDealsLoadCount(
  total: number,
  limit: number,
  loadedPages: number,
): number {
  if (limit <= 0) return 0;
  const remaining = total - loadedPages * limit;
  return Math.max(0, Math.min(limit, remaining));
}
