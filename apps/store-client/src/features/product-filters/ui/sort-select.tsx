"use client";

import { ArrowDownWideNarrow } from "lucide-react";
import { dict } from "@/shared/config";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/ui";

interface SortSelectProps {
  /** Current sort as `${sortBy}:${sortOrder}` (e.g. "createdAt:desc"). */
  currentSort: string;
  /** Apply a sort change (both `sortBy` and `sortOrder` at once). */
  onChange: (updates: Record<string, string | undefined>) => void;
  /**
   * The orders on offer, each `${sortBy}:${sortOrder}`. Defaults to the
   * catalogue's four; the wishlist passes its own client-side set («Нещодавно
   * додані», ціна, знижка — TASK-1300) so both toolbars share one control.
   */
  options?: readonly SortOption[];
  /** Accessible name of the trigger. Defaults to «Сортування». */
  ariaLabel?: string;
  /**
   * Turn the picked option's value into the URL updates `onChange` receives.
   * Defaults to the catalogue's `sortBy:sortOrder` split. `/search` passes its
   * own: the search endpoint takes one `sort` param whose default is ranked
   * relevance, not a column (TASK-876) — so both toolbars share one control.
   */
  toUpdates?: (value: string) => Record<string, string | undefined>;
}

/** The catalogue's `${sortBy}:${sortOrder}` value → both URL fields at once. */
function splitColumnSort(value: string): Record<string, string | undefined> {
  const [sortBy, sortOrder] = value.split(":");
  return { sortBy, sortOrder };
}

export interface SortOption {
  value: string;
  label: string;
}

const SORT_OPTIONS: readonly SortOption[] = [
  { value: "createdAt:desc", label: dict.filters.sort.newest },
  { value: "price:asc", label: dict.filters.sort.priceAsc },
  { value: "price:desc", label: dict.filters.sort.priceDesc },
  { value: "name:asc", label: dict.filters.sort.nameAsc },
];

/**
 * Catalog sort control — a pill-shaped dropdown for the page toolbar. Wraps the
 * shared Select so keyboard/screen-reader behaviour comes for free; the selected
 * label renders in the brand colour to match the design.
 *
 * Narrow phones: the toolbar puts this beside the «Фільтри» button, and the
 * longest labels («Ціна: від низької до високої») are wider than a 320px row.
 * So the trigger may shrink (`min-w-0`) and its label truncates with an
 * ellipsis instead of pushing the page sideways; the icon and the «Спочатку:»
 * prefix appear from `sm`, where there is room. The open list still shows every
 * label in full.
 */
export function SortSelect({
  currentSort,
  onChange,
  options = SORT_OPTIONS,
  ariaLabel = dict.filters.sortBy,
  toUpdates = splitColumnSort,
}: SortSelectProps) {
  const currentLabel = options.find(
    (option) => option.value === currentSort,
  )?.label;

  return (
    <Select
      value={currentSort}
      onValueChange={(value) => onChange(toUpdates(value))}
    >
      <SelectTrigger
        aria-label={ariaLabel}
        className="h-11 min-w-0 gap-2.5 rounded-xl border-[1.5px] border-border bg-card px-3 font-semibold text-foreground shadow-none *:data-[slot=select-value]:text-primary hover:border-primary sm:px-4"
      >
        <ArrowDownWideNarrow className="hidden size-[18px] sm:block" />
        <span className="hidden font-medium text-muted-foreground sm:inline">
          {dict.filters.sortPrefix}
        </span>
        <SelectValue className="min-w-0">
          {/* A block child so the ellipsis applies: the value slot itself is a
              flex box, where `text-overflow` has no effect. */}
          {currentLabel && (
            <span className="block truncate">{currentLabel}</span>
          )}
        </SelectValue>
      </SelectTrigger>
      <SelectContent align="end" className="rounded-xl">
        {options.map((option) => (
          <SelectItem key={option.value} value={option.value}>
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
