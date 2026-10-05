"use client";

import type { SearchParams } from "@/entities/search";
import { dict } from "@/shared/config";
import { SortSelect, type SortOption } from "@/features/product-filters";

/** The orders `GET /api/search` accepts, straight off the generated contract. */
export type SearchSortValue = NonNullable<SearchParams["sort"]>;

/** The default: ranked engine relevance, which no column can express. */
const DEFAULT_SEARCH_SORT: SearchSortValue = "relevance";

const SORT_OPTIONS: readonly (SortOption & { value: SearchSortValue })[] = [
  { value: "relevance", label: dict.catalog.searchPage.sortRelevance },
  { value: "newest", label: dict.filters.sort.newest },
  { value: "price_asc", label: dict.filters.sort.priceAsc },
  { value: "price_desc", label: dict.filters.sort.priceDesc },
];

/**
 * Read a `?sort=` value off the URL, dropping anything the API would reject.
 * `relevance` resolves to `undefined` so the default never rides in the query
 * string — one canonical URL per result set.
 */
export function parseSearchSort(
  raw: string | null,
): SearchSortValue | undefined {
  const match = SORT_OPTIONS.find((option) => option.value === raw);
  return match && match.value !== DEFAULT_SEARCH_SORT ? match.value : undefined;
}

/** The picked order → the one `sort` param, with relevance left off the URL. */
function toSearchSortUpdates(
  value: string,
): Record<string, string | undefined> {
  return { sort: value === DEFAULT_SEARCH_SORT ? undefined : value };
}

interface SearchSortSelectProps {
  /** Current order (omit for relevance). */
  value: SearchSortValue | undefined;
  /** Apply the new order as a URL update. */
  onChange: (updates: Record<string, string | undefined>) => void;
}

/**
 * Sort control for `/search` (TASK-417).
 *
 * The catalogue's own `SortSelect` since TASK-876 — same pill, same 320px
 * truncation, so the two toolbars are one design rather than two look-alikes.
 * Only the vocabulary differs: the search endpoint's first-class order is
 * ranked relevance, not a column, so it writes one `sort` param instead of the
 * catalogue's `sortBy`/`sortOrder` pair.
 */
export function SearchSortSelect({ value, onChange }: SearchSortSelectProps) {
  return (
    <SortSelect
      currentSort={value ?? DEFAULT_SEARCH_SORT}
      options={SORT_OPTIONS}
      ariaLabel={dict.catalog.searchPage.sortAria}
      toUpdates={toSearchSortUpdates}
      onChange={onChange}
    />
  );
}
