"use client";

import type { CategoryEntity } from "@/entities/category";
import type { ProductControllerFindAllParams } from "@/entities/product";
import { SearchInput } from "./search-input";

interface ProductFiltersProps {
  /** Root categories used to populate the category selector. */
  categories: CategoryEntity[];
  /** Currently-active filter params (derived from the URL). */
  currentParams: ProductControllerFindAllParams;
  /**
   * Apply one or more filter changes at once. Passing several keys keeps the
   * update atomic — important for the combined sort control which sets both
   * `sortBy` and `sortOrder`. An `undefined` value removes that param.
   */
  onFilterChange: (updates: Record<string, string | undefined>) => void;
}

const SORT_OPTIONS = [
  { value: "createdAt:desc", label: "Newest" },
  { value: "price:asc", label: "Price: Low to High" },
  { value: "price:desc", label: "Price: High to Low" },
  { value: "name:asc", label: "Name: A–Z" },
];

const inputClass =
  "rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring";

/**
 * Filter panel for the product list page: search, category, price range, and
 * sort. Each control writes its change back to the URL via `onFilterChange`.
 */
export function ProductFilters({
  categories,
  currentParams,
  onFilterChange,
}: ProductFiltersProps) {
  const currentSort = `${currentParams.sortBy ?? "createdAt"}:${currentParams.sortOrder ?? "desc"}`;
  const hasActiveFilters = Boolean(
    currentParams.categoryId ||
    currentParams.search ||
    currentParams.minPrice != null ||
    currentParams.maxPrice != null,
  );

  return (
    <fieldset className="flex flex-col gap-5 rounded-lg border border-border bg-card p-4">
      <legend className="px-1 text-base font-semibold text-card-foreground">
        Filters
      </legend>

      <SearchInput
        key={`search-${currentParams.search ?? ""}`}
        initialValue={currentParams.search ?? ""}
        onSearch={(value) => onFilterChange({ search: value })}
      />

      <div className="flex flex-col gap-1">
        <label
          htmlFor="filter-category"
          className="text-sm font-medium text-foreground"
        >
          Category
        </label>
        <select
          id="filter-category"
          value={currentParams.categoryId ?? ""}
          onChange={(event) =>
            onFilterChange({ categoryId: event.target.value || undefined })
          }
          className={inputClass}
        >
          <option value="">All categories</option>
          {categories.map((category) => (
            <option key={category.id} value={category.id}>
              {category.name}
            </option>
          ))}
        </select>
      </div>

      <div className="flex flex-col gap-1">
        <span className="text-sm font-medium text-foreground">Price range</span>
        <div className="flex items-center gap-2">
          <label htmlFor="filter-min-price" className="sr-only">
            Minimum price
          </label>
          <input
            key={`min-${currentParams.minPrice ?? ""}`}
            id="filter-min-price"
            type="number"
            min="0"
            step="0.01"
            inputMode="decimal"
            placeholder="Min"
            defaultValue={currentParams.minPrice ?? ""}
            onBlur={(event) =>
              onFilterChange({ minPrice: event.target.value || undefined })
            }
            className={`${inputClass} w-full`}
          />
          <span aria-hidden="true" className="text-muted-foreground">
            –
          </span>
          <label htmlFor="filter-max-price" className="sr-only">
            Maximum price
          </label>
          <input
            key={`max-${currentParams.maxPrice ?? ""}`}
            id="filter-max-price"
            type="number"
            min="0"
            step="0.01"
            inputMode="decimal"
            placeholder="Max"
            defaultValue={currentParams.maxPrice ?? ""}
            onBlur={(event) =>
              onFilterChange({ maxPrice: event.target.value || undefined })
            }
            className={`${inputClass} w-full`}
          />
        </div>
      </div>

      <div className="flex flex-col gap-1">
        <label
          htmlFor="filter-sort"
          className="text-sm font-medium text-foreground"
        >
          Sort by
        </label>
        <select
          id="filter-sort"
          value={currentSort}
          onChange={(event) => {
            const [sortBy, sortOrder] = event.target.value.split(":");
            onFilterChange({ sortBy, sortOrder });
          }}
          className={inputClass}
        >
          {SORT_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>

      {hasActiveFilters && (
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
          className="self-start rounded-lg border border-border px-3 py-2 text-sm font-medium text-foreground hover:bg-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          Clear filters
        </button>
      )}
    </fieldset>
  );
}
