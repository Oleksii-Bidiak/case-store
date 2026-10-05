"use client";

import { Search, X } from "lucide-react";
import { dict } from "@/shared/config";

export interface FilterChip {
  /** Stable React key — unique within the row. */
  key: string;
  /** Visible text, e.g. «Виробник: Apple» or «В наявності». */
  label: string;
  /** Drop just this filter. */
  onRemove: () => void;
  /** The keyword chip: brand-tinted, with a search glyph. */
  isSearch?: boolean;
}

interface FilterChipListProps {
  chips: readonly FilterChip[];
  /** Drop every filter the row stands for («Очистити все»). */
  onClearAll: () => void;
}

/**
 * FilterChipList — the row of removable active-filter pills above a product
 * grid, plus a trailing «Очистити все» (TASK-1300).
 *
 * Pure markup: the caller decides which chips exist and what removing one
 * means. `ActiveFilterChips` derives them from the catalogue URL; the wishlist
 * derives them from its client-side filter state. Until this was split out the
 * wishlist kept its own copy, which had drifted to a brand-filled pill the
 * catalogue never used.
 *
 * Every chip is a real `<button>` whose accessible name is «<label> Прибрати
 * фільтр»; the × is decoration. Renders nothing for an empty list, so the
 * caller never has to guard it.
 */
export function FilterChipList({ chips, onClearAll }: FilterChipListProps) {
  if (chips.length === 0) {
    return null;
  }

  return (
    <div className="mb-5 flex min-h-8.5 flex-wrap items-center gap-2.5">
      {chips.map((chip) => (
        <button
          key={chip.key}
          type="button"
          onClick={chip.onRemove}
          className={`inline-flex h-8.5 items-center gap-2 rounded-full border py-0 pr-2 pl-3.5 text-sm font-semibold outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring ${
            chip.isSearch
              ? "border-primary/30 bg-primary/10 text-primary"
              : "border-border bg-card text-foreground hover:border-primary/40"
          }`}
        >
          {chip.isSearch && <Search className="size-3.5" aria-hidden="true" />}
          {chip.label}
          <span
            aria-hidden="true"
            className={`inline-flex size-4.5 items-center justify-center rounded-full ${
              chip.isSearch
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-muted-foreground"
            }`}
          >
            <X className="size-2.75" strokeWidth={3} />
          </span>
          <span className="sr-only">{dict.filters.removeFilter}</span>
        </button>
      ))}
      <button
        type="button"
        onClick={onClearAll}
        className="text-sm font-semibold text-muted-foreground underline decoration-1 underline-offset-3 outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
      >
        {dict.filters.clearAll}
      </button>
    </div>
  );
}
