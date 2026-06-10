"use client";

import { useCallback } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCategoryControllerGetRootCategories } from "@/entities/category";
import type { ProductControllerFindAllParams } from "@/entities/product";
import { ProductFilters } from "@/features/product-filters";
import { ProductList } from "./product-list";

interface ProductListViewProps {
  /** Server-resolved initial params (from `await searchParams`). */
  initialParams: ProductControllerFindAllParams;
}

const PAGE_SIZE = 20;

/**
 * Orchestrates the product list page: keeps filter state in the URL, fetches
 * categories for the filter panel, and renders the filters + results grid.
 */
export function ProductListView({ initialParams }: ProductListViewProps) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  // Derive active params from the live URL, falling back to server-resolved
  // initials (which match the URL on first render).
  const minPriceRaw = searchParams.get("minPrice");
  const maxPriceRaw = searchParams.get("maxPrice");
  const pageRaw = searchParams.get("page");

  const params: ProductControllerFindAllParams = {
    categoryId: searchParams.get("categoryId") ?? initialParams.categoryId,
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
      next.set("page", "1"); // reset pagination on any filter change
      router.replace(`${pathname}?${next.toString()}`);
    },
    [searchParams, pathname, router],
  );

  const buildPageHref = useCallback(
    (targetPage: number) => {
      const next = new URLSearchParams(searchParams.toString());
      next.set("page", String(targetPage));
      return `${pathname}?${next.toString()}`;
    },
    [searchParams, pathname],
  );

  const { data: categoriesData } = useCategoryControllerGetRootCategories({
    isActive: true,
    sortBy: "sortOrder",
    sortOrder: "asc",
  });
  const categories = categoriesData?.data ?? [];

  return (
    <div className="grid grid-cols-1 gap-8 lg:grid-cols-[16rem_1fr]">
      <aside className="lg:sticky lg:top-8 lg:self-start">
        <ProductFilters
          categories={categories}
          currentParams={params}
          onFilterChange={applyFilters}
        />
      </aside>
      <div>
        <ProductList params={params} buildPageHref={buildPageHref} />
      </div>
    </div>
  );
}
