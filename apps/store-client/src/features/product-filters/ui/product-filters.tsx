"use client";

import type { CategoryEntity } from "@/entities/category";
import type { ProductControllerFindAllParams } from "@/entities/product";
import { dict } from "@/shared/config";
import {
  Button,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/ui";
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
  { value: "createdAt:desc", label: dict.filters.sort.newest },
  { value: "price:asc", label: dict.filters.sort.priceAsc },
  { value: "price:desc", label: dict.filters.sort.priceDesc },
  { value: "name:asc", label: dict.filters.sort.nameAsc },
];

// Radix Select cannot use an empty-string item value, so the "all categories"
// option uses this sentinel and maps back to `undefined` on change.
const ALL_CATEGORIES = "all";

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

  return (
    <fieldset className="flex flex-col gap-5 rounded-lg border border-border bg-card p-4">
      <legend className="px-1 text-base font-semibold text-card-foreground">
        {dict.filters.legend}
      </legend>

      <SearchInput
        initialValue={currentParams.search ?? ""}
        onSearch={(value) => onFilterChange({ search: value })}
      />

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="filter-category">{dict.filters.category}</Label>
        <Select
          value={currentParams.categoryId ?? ALL_CATEGORIES}
          onValueChange={(value) =>
            onFilterChange({
              categoryId: value === ALL_CATEGORIES ? undefined : value,
            })
          }
        >
          <SelectTrigger id="filter-category" className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL_CATEGORIES}>
              {dict.filters.allCategories}
            </SelectItem>
            {categories.map((category) => (
              <SelectItem key={category.id} value={category.id}>
                {category.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex flex-col gap-1.5">
        <span className="text-sm font-medium text-foreground">
          {dict.filters.priceRange}
        </span>
        <div className="flex items-center gap-2">
          <Label htmlFor="filter-min-price" className="sr-only">
            {dict.filters.minPrice}
          </Label>
          <Input
            key={`min-${currentParams.minPrice ?? ""}`}
            id="filter-min-price"
            type="number"
            min="0"
            step="0.01"
            inputMode="decimal"
            placeholder={dict.filters.minPlaceholder}
            defaultValue={currentParams.minPrice ?? ""}
            onBlur={(event) =>
              onFilterChange({ minPrice: event.target.value || undefined })
            }
          />
          <span aria-hidden="true" className="text-muted-foreground">
            –
          </span>
          <Label htmlFor="filter-max-price" className="sr-only">
            {dict.filters.maxPrice}
          </Label>
          <Input
            key={`max-${currentParams.maxPrice ?? ""}`}
            id="filter-max-price"
            type="number"
            min="0"
            step="0.01"
            inputMode="decimal"
            placeholder={dict.filters.maxPlaceholder}
            defaultValue={currentParams.maxPrice ?? ""}
            onBlur={(event) =>
              onFilterChange({ maxPrice: event.target.value || undefined })
            }
          />
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="filter-sort">{dict.filters.sortBy}</Label>
        <Select
          value={currentSort}
          onValueChange={(value) => {
            const [sortBy, sortOrder] = value.split(":");
            onFilterChange({ sortBy, sortOrder });
          }}
        >
          <SelectTrigger id="filter-sort" className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {SORT_OPTIONS.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <Button
        type="button"
        variant="outline"
        size="sm"
        className="self-start"
        onClick={() =>
          onFilterChange({
            categoryId: undefined,
            search: undefined,
            minPrice: undefined,
            maxPrice: undefined,
          })
        }
      >
        {dict.filters.clear}
      </Button>
    </fieldset>
  );
}
