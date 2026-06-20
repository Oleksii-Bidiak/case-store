"use client";

import { X } from "lucide-react";
import type { CategoryEntity } from "@/entities/category";
import type { ProductControllerFindAllParams } from "@/entities/product";
import { formatMoney } from "@/shared/lib";
import { dict } from "@/shared/config";

interface ActiveFilterChipsProps {
  categories: CategoryEntity[];
  currentParams: ProductControllerFindAllParams;
  onFilterChange: (updates: Record<string, string | undefined>) => void;
}

/**
 * ActiveFilterChips — a removable chip per active filter (category, search,
 * min/max price), shown above the product grid. Each chip's × clears just that
 * filter; a trailing "clear all" clears every filter at once.
 */
export function ActiveFilterChips({
  categories,
  currentParams,
  onFilterChange,
}: ActiveFilterChipsProps) {
  const chips: { key: string; label: string; clear: () => void }[] = [];

  if (currentParams.categoryId) {
    const name =
      categories.find((c) => c.id === currentParams.categoryId)?.name ??
      dict.filters.category;
    chips.push({
      key: "categoryId",
      label: name,
      clear: () => onFilterChange({ categoryId: undefined }),
    });
  }

  if (currentParams.search) {
    chips.push({
      key: "search",
      label: `“${currentParams.search}”`,
      clear: () => onFilterChange({ search: undefined }),
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
    <div className="mb-4 flex flex-wrap items-center gap-2">
      {chips.map((chip) => (
        <button
          key={chip.key}
          type="button"
          onClick={chip.clear}
          className="inline-flex items-center gap-1 rounded-full border border-border bg-card py-1 pr-2 pl-3 text-xs font-medium text-foreground transition-colors hover:bg-accent focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {chip.label}
          <X className="size-3.5 text-muted-foreground" aria-hidden="true" />
          <span className="sr-only">{dict.filters.removeFilter}</span>
        </button>
      ))}
      <button
        type="button"
        onClick={() =>
          onFilterChange({
            categoryId: undefined,
            search: undefined,
            minPrice: undefined,
            maxPrice: undefined,
          })
        }
        className="text-xs font-medium text-primary hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        {dict.filters.clear}
      </button>
    </div>
  );
}
