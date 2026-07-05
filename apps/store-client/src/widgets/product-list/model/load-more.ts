import type { ProductControllerFindAllParams } from "@/entities/product";

/**
 * Pure model for the catalog «Показати ще» (load-more) append (TASK-216).
 *
 * The URL (`?page=` + filters) stays the single source of truth: it anchors the
 * BASE page of the result set, and load-more appends the pages that follow as
 * ephemeral client state (the URL is not touched). Whenever the result set
 * identified by `accumulationKey` changes — any filter, sort, base page or page
 * size — the accumulation must reset to zero appended pages. The component
 * applies that reset with a render-time guard (state carries the key it was
 * created for; a mismatched key reads as zero), per docs/conventions/forms.md.
 */

/**
 * Identity of one result set: every list param (filters, sort, base page,
 * limit) serialized with sorted keys so the key is order-insensitive and
 * `undefined` values are indistinguishable from absent ones.
 */
export function accumulationKey(
  params: ProductControllerFindAllParams,
): string {
  const record = params as Record<string, unknown>;
  const normalized: Record<string, unknown> = {};
  for (const key of Object.keys(record).sort()) {
    if (record[key] !== undefined) {
      normalized[key] = record[key];
    }
  }
  return JSON.stringify(normalized);
}

/**
 * Merge the base page plus appended pages into one list, preserving page order
 * and deduplicating by `id`. Duplicates can appear legitimately: the catalog can
 * change between fetches (a product inserted/removed shifts page boundaries).
 * Pages still in flight are passed as `undefined` and skipped.
 */
export function mergeProductPages<T extends { id: string }>(
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

/** Whether another page can be appended after `basePage + extraPages`. */
export function canLoadMore(
  basePage: number,
  extraPages: number,
  totalPages: number,
): boolean {
  return basePage + extraPages < totalPages;
}

/**
 * How many items the NEXT append will add (drives the «Показати ще N» label):
 * a full `limit` for interior pages, the remainder on the final page, zero when
 * everything after `lastLoadedPage` is exhausted or inputs are degenerate.
 */
export function nextLoadCount(
  total: number,
  limit: number,
  lastLoadedPage: number,
): number {
  if (limit <= 0) return 0;
  const remaining = total - lastLoadedPage * limit;
  return Math.max(0, Math.min(limit, remaining));
}
