"use client";

import { ArrowDownWideNarrow } from "lucide-react";
import type { SearchParams } from "@/entities/search";
import { dict } from "@/shared/config";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/ui";

/** The orders `GET /api/search` accepts, straight off the generated contract. */
export type SearchSortValue = NonNullable<SearchParams["sort"]>;

/** The default: ranked engine relevance, which no column can express. */
export const DEFAULT_SEARCH_SORT: SearchSortValue = "relevance";

const SORT_OPTIONS: { value: SearchSortValue; label: string }[] = [
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

interface SearchSortSelectProps {
  /** Current order (omit for relevance). */
  value: SearchSortValue | undefined;
  /** Apply the new order as a URL update. */
  onChange: (updates: Record<string, string | undefined>) => void;
}

/**
 * Sort control for `/search` (TASK-417).
 *
 * Deliberately NOT the catalogue's `SortSelect`: that one writes a
 * `sortBy`/`sortOrder` column pair, and the search endpoint's first-class order
 * is ranked relevance — not a column, so it cannot be spelled that way. Same
 * pill styling, so the two toolbars still read as one design.
 */
export function SearchSortSelect({ value, onChange }: SearchSortSelectProps) {
  return (
    <Select
      value={value ?? DEFAULT_SEARCH_SORT}
      onValueChange={(next) =>
        onChange({ sort: next === DEFAULT_SEARCH_SORT ? undefined : next })
      }
    >
      <SelectTrigger
        aria-label={dict.catalog.searchPage.sortAria}
        className="h-11 gap-2.5 rounded-xl border-2 border-border bg-card px-4 font-semibold text-foreground shadow-none *:data-[slot=select-value]:text-primary hover:border-primary"
      >
        <ArrowDownWideNarrow className="size-5" />
        <span className="hidden font-medium text-muted-foreground sm:inline">
          {dict.filters.sortPrefix}
        </span>
        <SelectValue />
      </SelectTrigger>
      <SelectContent align="end" className="rounded-xl">
        {SORT_OPTIONS.map((option) => (
          <SelectItem key={option.value} value={option.value}>
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
