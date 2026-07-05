"use client";

import { Search, X } from "lucide-react";
import type { ProductControllerFindAllParams } from "@/entities/product";
import { formatMoney } from "@/shared/lib";
import { dict } from "@/shared/config";

interface ActiveFilterChipsProps {
  currentParams: ProductControllerFindAllParams;
  /**
   * Display name for the active brand (`?brandId=`), resolved by the parent from
   * the brand list. When absent the brand chip is not rendered even if a
   * `brandId` is set (e.g. the list is still loading).
   */
  brandName?: string;
  onFilterChange: (updates: Record<string, string | undefined>) => void;
}

/**
 * ActiveFilterChips — a removable pill per active filter (search, min/max
 * price), shown above the product grid. Each chip's × clears just that filter;
 * a trailing "clear all" clears every filter at once (including the category,
 * whose visible control is the `CategoryChips` row since TASK-216 — it is not
 * duplicated here). The search chip is highlighted in the brand colour and
 * carries a search glyph.
 */
export function ActiveFilterChips({
  currentParams,
  brandName,
  onFilterChange,
}: ActiveFilterChipsProps) {
  const chips: {
    key: string;
    label: string;
    isSearch?: boolean;
    clear: () => void;
  }[] = [];

  if (currentParams.search) {
    chips.push({
      key: "search",
      label: `«${currentParams.search}»`,
      isSearch: true,
      clear: () => onFilterChange({ search: undefined }),
    });
  }

  if (currentParams.brandId && brandName) {
    chips.push({
      key: "brandId",
      label: `${dict.filters.brandTitle}: ${brandName}`,
      clear: () => onFilterChange({ brandId: undefined }),
    });
  }

  if (currentParams.minPrice != null) {
    chips.push({
      key: "minPrice",
      label: `${dict.filters.minPlaceholder}: ${formatMoney(String(currentParams.minPrice))}`,
      clear: () => onFilterChange({ minPrice: undefined }),
    });
  }

  if (currentParams.maxPrice != null) {
    chips.push({
      key: "maxPrice",
      label: `${dict.filters.maxPlaceholder}: ${formatMoney(String(currentParams.maxPrice))}`,
      clear: () => onFilterChange({ maxPrice: undefined }),
    });
  }

  if (chips.length === 0) {
    return null;
  }

  return (
    <div className="mb-5 flex min-h-[34px] flex-wrap items-center gap-2.5">
      {chips.map((chip) => (
        <button
          key={chip.key}
          type="button"
          onClick={chip.clear}
          className={`inline-flex h-[34px] items-center gap-2 rounded-full border py-0 pr-2 pl-3.5 text-[13.5px] font-semibold outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring ${
            chip.isSearch
              ? "border-primary/30 bg-primary/10 text-primary"
              : "border-border bg-card text-foreground hover:border-primary/40"
          }`}
        >
          {chip.isSearch && <Search className="size-3.5" aria-hidden="true" />}
          {chip.label}
          <span
            aria-hidden="true"
            className={`inline-flex size-[18px] items-center justify-center rounded-full ${
              chip.isSearch
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-muted-foreground"
            }`}
          >
            <X className="size-[11px]" strokeWidth={3} />
          </span>
          <span className="sr-only">{dict.filters.removeFilter}</span>
        </button>
      ))}
      <button
        type="button"
        onClick={() =>
          onFilterChange({
            categoryId: undefined,
            brandId: undefined,
            search: undefined,
            minPrice: undefined,
            maxPrice: undefined,
          })
        }
        className="text-[13.5px] font-semibold text-muted-foreground underline decoration-1 underline-offset-[3px] outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
      >
        {dict.filters.clearAll}
      </button>
    </div>
  );
}
