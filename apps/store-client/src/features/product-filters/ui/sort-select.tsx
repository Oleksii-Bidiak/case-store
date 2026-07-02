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
}

const SORT_OPTIONS = [
  { value: "createdAt:desc", label: dict.filters.sort.newest },
  { value: "price:asc", label: dict.filters.sort.priceAsc },
  { value: "price:desc", label: dict.filters.sort.priceDesc },
  { value: "name:asc", label: dict.filters.sort.nameAsc },
];

/**
 * Catalog sort control — a pill-shaped dropdown for the page toolbar. Wraps the
 * shared Select so keyboard/screen-reader behaviour comes for free; the selected
 * label renders in the brand colour to match the design.
 */
export function SortSelect({ currentSort, onChange }: SortSelectProps) {
  return (
    <Select
      value={currentSort}
      onValueChange={(value) => {
        const [sortBy, sortOrder] = value.split(":");
        onChange({ sortBy, sortOrder });
      }}
    >
      <SelectTrigger
        aria-label={dict.filters.sortBy}
        className="h-11 gap-2.5 rounded-xl border-[1.5px] border-border bg-card px-4 font-semibold text-foreground shadow-none *:data-[slot=select-value]:text-primary hover:border-primary"
      >
        <ArrowDownWideNarrow className="size-[18px]" />
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
