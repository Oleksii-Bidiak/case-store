"use client";

import { useCallback, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { SlidersHorizontal } from "lucide-react";
import { useCategoryControllerGetCategoryTree } from "@/entities/category";
import type { ProductControllerFindAllParams } from "@/entities/product";
import {
  ProductFilters,
  ActiveFilterChips,
  CategoryChips,
  SortSelect,
  ViewToggle,
  type CatalogView,
} from "@/features/product-filters";
import {
  Sheet,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/shared/ui";
import { dict, STICKY_ASIDE_TOP } from "@/shared/config";
import { ProductList } from "./product-list";

interface ProductListViewProps {
  /** Server-resolved initial params (from `await searchParams`). */
  initialParams: ProductControllerFindAllParams;
}

const PAGE_SIZE = 20;

/** Keys that clearing "all filters" removes (everything except sort/view/page). */
const CLEARABLE_FILTERS = {
  categoryId: undefined,
  search: undefined,
  minPrice: undefined,
  maxPrice: undefined,
  deviceModelId: undefined,
} as const;

/**
 * Orchestrates the catalog page: keeps filter/sort/view state in the URL, fetches
 * categories for the chips row, and renders the category chips (TASK-216 — the
 * category selector moved out of the sidebar into a horizontal row above the
 * grid), the toolbar (sort + view toggle + mobile filters), active-filter chips,
 * the sidebar (desktop aside + mobile drawer) and the results grid/list.
 */
export function ProductListView({ initialParams }: ProductListViewProps) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  const [filtersOpen, setFiltersOpen] = useState(false);

  // Derive active params from the live URL, falling back to server-resolved
  // initials (which match the URL on first render).
  const minPriceRaw = searchParams.get("minPrice");
  const maxPriceRaw = searchParams.get("maxPrice");
  const pageRaw = searchParams.get("page");

  const params: ProductControllerFindAllParams = {
    categoryId: searchParams.get("categoryId") ?? initialParams.categoryId,
    deviceModelId:
      searchParams.get("deviceModelId") ?? initialParams.deviceModelId,
    search: searchParams.get("search") ?? initialParams.search,
    sortBy: searchParams.get("sortBy") ?? initialParams.sortBy ?? "createdAt",
    sortOrder:
      searchParams.get("sortOrder") ?? initialParams.sortOrder ?? "desc",
    minPrice: minPriceRaw ? Number(minPriceRaw) : initialParams.minPrice,
    maxPrice: maxPriceRaw ? Number(maxPriceRaw) : initialParams.maxPrice,
    page: pageRaw ? Number(pageRaw) : (initialParams.page ?? 1),
    limit: PAGE_SIZE,
    isActive: true,
  };

  const view: CatalogView =
    searchParams.get("view") === "list" ? "list" : "grid";
  const currentSort = `${params.sortBy}:${params.sortOrder}`;

  // Count of active filters INSIDE the drawer/sidebar — drives the mobile
  // "Filters" badge. The category is excluded: its control is the always-visible
  // chips row, not the drawer (TASK-216).
  const activeFilterCount =
    (params.search ? 1 : 0) +
    (params.minPrice != null ? 1 : 0) +
    (params.maxPrice != null ? 1 : 0) +
    (params.deviceModelId ? 1 : 0);

  const applyFilters = useCallback(
    (updates: Record<string, string | undefined>) => {
      const next = new URLSearchParams(searchParams.toString());
      for (const [key, value] of Object.entries(updates)) {
        if (value) {
          next.set(key, value);
        } else {
          next.delete(key);
        }
      }
      next.set("page", "1"); // reset pagination on any filter/sort change
      router.replace(`${pathname}?${next.toString()}`);
    },
    [searchParams, pathname, router],
  );

  // View toggle preserves the current page (it does not change the result set).
  const setView = useCallback(
    (nextView: CatalogView) => {
      const next = new URLSearchParams(searchParams.toString());
      if (nextView === "grid") {
        next.delete("view");
      } else {
        next.set("view", nextView);
      }
      router.replace(`${pathname}?${next.toString()}`);
    },
    [searchParams, pathname, router],
  );

  const clearFilters = useCallback(
    () => applyFilters({ ...CLEARABLE_FILTERS }),
    [applyFilters],
  );

  const buildPageHref = useCallback(
    (targetPage: number) => {
      const next = new URLSearchParams(searchParams.toString());
      next.set("page", String(targetPage));
      return `${pathname}?${next.toString()}`;
    },
    [searchParams, pathname],
  );

  // The public tree carries roots + their children in one payload, so the chips
  // row can offer a second, "narrow to a subcategory" level without a second
  // request (TASK-236). Only active categories are returned.
  const { data: categoriesData } = useCategoryControllerGetCategoryTree();
  const categories = categoriesData?.data ?? [];

  return (
    <div>
      {/* Category chips — horizontal, scrollable on mobile; drives ?categoryId= */}
      <CategoryChips
        categories={categories}
        activeCategoryId={params.categoryId}
        onSelect={(categoryId) => applyFilters({ categoryId })}
      />

      {/* Toolbar: mobile filters button (left) + view toggle + sort (right) */}
      <div className="mb-5 flex items-center gap-3">
        <button
          type="button"
          onClick={() => setFiltersOpen(true)}
          className="inline-flex h-11 items-center gap-2 rounded-xl border-[1.5px] border-border bg-card px-4 text-sm font-semibold text-foreground outline-none transition-colors hover:border-primary focus-visible:ring-2 focus-visible:ring-ring lg:hidden"
        >
          <SlidersHorizontal className="size-[18px]" />
          {dict.filters.filtersButton}
          {activeFilterCount > 0 && (
            <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-[11.5px] font-bold text-primary-foreground">
              {activeFilterCount}
            </span>
          )}
        </button>

        <div className="ml-auto flex items-center gap-3">
          <ViewToggle
            view={view}
            onChange={setView}
            className="hidden lg:flex"
          />
          <SortSelect currentSort={currentSort} onChange={applyFilters} />
        </div>
      </div>

      <ActiveFilterChips currentParams={params} onFilterChange={applyFilters} />

      <div className="grid grid-cols-1 items-start gap-7 lg:grid-cols-[268px_1fr]">
        {/* Desktop sidebar */}
        <aside
          className={`hidden lg:sticky ${STICKY_ASIDE_TOP} lg:block lg:self-start`}
        >
          <ProductFilters
            currentParams={params}
            onFilterChange={applyFilters}
          />
        </aside>

        <section className="min-w-0">
          <ProductList
            params={params}
            buildPageHref={buildPageHref}
            view={view}
            onClearFilters={clearFilters}
          />
        </section>
      </div>

      {/* Mobile filters drawer */}
      <Sheet open={filtersOpen} onOpenChange={setFiltersOpen}>
        <SheetContent
          side="left"
          className="w-[342px] max-w-[88vw] gap-0 overflow-y-auto p-0"
        >
          <SheetHeader className="border-b border-border">
            <SheetTitle className="font-display text-lg font-bold">
              {dict.filters.legend}
            </SheetTitle>
          </SheetHeader>
          <div className="p-4">
            <ProductFilters
              idPrefix="filter-m"
              currentParams={params}
              onFilterChange={applyFilters}
            />
          </div>
          <SheetFooter className="border-t border-border">
            <button
              type="button"
              onClick={() => setFiltersOpen(false)}
              className="h-12 w-full rounded-xl bg-primary text-[15px] font-bold text-primary-foreground transition-colors hover:bg-primary/90"
            >
              {dict.filters.mobileApply}
            </button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </div>
  );
}
