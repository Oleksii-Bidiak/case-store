"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Loader2, SlidersHorizontal } from "lucide-react";
import { useSearch } from "@/entities/search";
import { useCategoryControllerGetCategoryTree } from "@/entities/category";
import type { ProductControllerFindAllParams } from "@/entities/product";
import {
  CategoryChips,
  FiltersDrawer,
  ProductFilters,
  clearFilterUpdates,
  countActiveFilters,
} from "@/features/product-filters";
import { ProductCard } from "@/shared/ui";
import { Pagination } from "@/shared/ui/pagination";
import { ProductCardActions } from "@/widgets/product-card-actions";
import { ProductQuickViewTrigger } from "@/widgets/product-quick-view";
import { dict, STICKY_ASIDE_TOP } from "@/shared/config";
import { trackEvent } from "@/shared/lib";
import { findCategoryIdBySlug } from "../model/find-category";
import { SearchResultsSkeleton } from "./search-results-skeleton";
import {
  SearchSortSelect,
  parseSearchSort,
  type SearchSortValue,
} from "./search-sort-select";

const PAGE_SIZE = 20;

/**
 * Same sidebar scroll box the catalogue uses: a sticky aside with no height cap
 * runs off a short viewport and, being `position: sticky`, page scroll never
 * brings the overflow back.
 */
const ASIDE_SCROLL_BOX =
  "lg:max-h-[calc(100dvh-7rem)] lg:overflow-y-auto lg:overscroll-contain";

interface SearchResultsViewProps {
  /** The search query from the URL (`?q=`). May be blank. */
  query: string;
  /** 1-based page from the URL (`?page=`). */
  page: number;
}

/** The facets `/search` narrows by — the subset of the panel the API accepts. */
interface SearchFacets {
  /**
   * Category SLUG — `?category=phone-cases` (TASK-523). The API rolls it up over
   * the whole subtree, exactly like the catalogue listing.
   */
  category?: string;
  /** Brand SLUG — `?brand=apple` (TASK-420). */
  brand?: string;
  /** Device-model SLUG — `?device=iphone-15` (TASK-420). */
  device?: string;
  inStock?: true;
  minPrice?: number;
  maxPrice?: number;
  sort?: SearchSortValue;
}

/**
 * SearchResultsView — client widget for the `/search` results page.
 *
 * Consumes the Orval `useSearch` hook (Meilisearch with a Postgres fallback,
 * engine-agnostic) and reuses `ProductCard`, so results look exactly like the
 * catalogue. Since TASK-417 it also carries the catalogue's filter panel and the
 * shared numbered pagination: a search used to be a dead end — twenty cards, a
 * bare prev/next, and no way to say "only these, under 500 ₴, in stock".
 *
 * Filter state lives in the URL, never in component state, so a filtered result
 * page is shareable and survives a reload. The server component hands down the
 * first `q`/`page`; from then on the live URL wins (they agree on first render).
 *
 * The category is picked from the same chips row the catalogue uses and rides
 * the URL as a slug (TASK-523). Its id is handed to the panel, so the brand
 * list is scoped to it — but the panel's spec facets and «Зі знижкою» stay
 * hidden (`hideSpecFacets`, `hideOnSale`): `GET /api/search` takes neither
 * `?specs=` nor `?onSale=`, and a control the endpoint ignores is worse than
 * no control. Per-category result counts on the chips need facet counts from
 * the search engine, which are not requested yet (TASK-1401).
 */
export function SearchResultsView({ query, page }: SearchResultsViewProps) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  const [filtersOpen, setFiltersOpen] = useState(false);

  // The live URL is the source of truth; the server-resolved props are the
  // first-render fallback (and the value for a param the URL does not carry).
  const trimmed = (searchParams.get("q") ?? query).trim();
  const enabled = trimmed.length > 0;

  const pageRaw = searchParams.get("page");
  const currentPage =
    pageRaw && Number(pageRaw) > 0 ? Math.floor(Number(pageRaw)) : page;

  const minPriceRaw = searchParams.get("minPrice");
  const maxPriceRaw = searchParams.get("maxPrice");
  const facets: SearchFacets = {
    category: searchParams.get("category") ?? undefined,
    brand: searchParams.get("brand") ?? undefined,
    device: searchParams.get("device") ?? undefined,
    // Only the literal "true" turns availability on — "false" means "no filter",
    // which is also what the API's own boolean transform does with it.
    inStock: searchParams.get("inStock") === "true" ? true : undefined,
    minPrice: minPriceRaw ? Number(minPriceRaw) : undefined,
    maxPrice: maxPriceRaw ? Number(maxPriceRaw) : undefined,
    sort: parseSearchSort(searchParams.get("sort")),
  };

  const { data, isPending, isFetching, isError } = useSearch(
    { q: trimmed, page: currentPage, limit: PAGE_SIZE, ...facets },
    { query: { enabled } },
  );

  // The panel speaks the catalogue's param language. The keyword box is fed the
  // page's own query: on `/search` the keyword IS the subject of the page, so
  // editing it there edits `?q=` (see `applyFilters`).
  const panelParams: ProductControllerFindAllParams = {
    search: trimmed,
    category: facets.category,
    brand: facets.brand,
    device: facets.device,
    minPrice: facets.minPrice,
    maxPrice: facets.maxPrice,
    inStock: facets.inStock,
  };

  // The public tree (roots + children, one payload) feeds the chips row and the
  // slug → id lookup the id-addressed brand list needs — the same query the
  // catalogue already holds, so it is shared through React Query's cache.
  const { data: categoriesData } = useCategoryControllerGetCategoryTree();
  const categories = categoriesData?.data ?? [];
  const activeCategoryId = facets.category
    ? findCategoryIdBySlug(categories, facets.category)
    : undefined;

  // Badge on the mobile «Фільтри» button. Counted through the shared definition
  // (TASK-414) and without the keyword, which is the query rather than a filter.
  // The category is excluded as on the catalogue: its control is the chips row.
  const activeFilterCount = countActiveFilters(
    { ...panelParams, search: undefined },
    { includeCategory: false },
  );

  const applyFilters = useCallback(
    (updates: Record<string, string | undefined>) => {
      const entries = Object.entries(updates);
      // «Скинути фільтри» sends EVERY filter key at once, all empty. On this
      // page the keyword is not one of the filters being reset — clearing it
      // would throw the shopper back to the blank "start searching" prompt under
      // a button that only promised to drop the filters.
      const isReset =
        entries.length > 1 && entries.every(([, value]) => !value);

      const next = new URLSearchParams(searchParams.toString());
      for (const [key, value] of entries) {
        const param = key === "search" ? "q" : key;
        if (param === "q" && isReset) continue;
        if (value) {
          next.set(param, value);
        } else {
          next.delete(param);
        }
      }
      next.set("page", "1"); // any filter/sort change starts the results over
      router.replace(`${pathname}?${next.toString()}`);
    },
    [searchParams, pathname, router],
  );

  // The drawer's zero-results action clears EVERY filter, the category chip
  // included — named «Скинути всі фільтри» like the catalogue's, and apart from
  // the panel's own reset, which keeps the category (TASK-516). A full-set
  // reset is what `applyFilters` recognises, so `?q=` survives it.
  const resetFilters = useCallback(
    () => applyFilters(clearFilterUpdates()),
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

  // Analytics: report the search term once per distinct non-empty query. Keyed
  // on `trimmed`, so paging or filtering the same query does not re-fire, and
  // the no-query state emits nothing.
  useEffect(() => {
    if (!enabled) return;
    trackEvent("search", { query: trimmed });
  }, [enabled, trimmed]);

  // No query yet — invite the shopper to search (no request, and no filter
  // panel: there is nothing yet to narrow).
  if (!enabled) {
    return (
      <div className="rounded-lg border border-border bg-card p-8 text-center">
        <p className="text-base font-medium text-card-foreground">
          {dict.search.promptHeading}
        </p>
        <p className="mt-1 text-sm text-muted-foreground">
          {dict.search.promptBody}
        </p>
      </div>
    );
  }

  const products = data?.data ?? [];
  const meta = data?.meta;
  const totalPages = meta?.totalPages ?? 1;

  /**
   * The results column: skeleton, error, empty state or the grid. Rendered
   * inside the sidebar layout in every one of those states — an empty result
   * under an active filter is exactly when the shopper needs the panel most.
   */
  const results = isPending ? (
    <SearchResultsSkeleton />
  ) : isError ? (
    <p role="alert" className="text-sm text-destructive">
      {dict.search.error}
    </p>
  ) : products.length === 0 ? (
    <div className="rounded-lg border border-border bg-card p-8 text-center">
      <p className="text-base font-medium text-card-foreground">
        {dict.search.emptyHeading(trimmed)}
      </p>
      <p className="mt-1 text-sm text-muted-foreground">
        {dict.search.emptyBody}
      </p>
      <Link
        href="/products"
        className="mt-3 inline-block text-sm font-medium text-primary hover:underline"
      >
        {dict.search.browseAll}
      </Link>
    </div>
  ) : (
    <div className="flex flex-col gap-6">
      <p aria-live="polite" className="text-sm text-muted-foreground">
        {dict.search.countFound(meta?.total ?? products.length)}
      </p>

      <div className="relative">
        {isFetching && (
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center rounded-lg bg-background/60"
          >
            <Loader2 className="size-8 animate-spin text-primary" />
          </div>
        )}
        {/* Same 1 / 2 / 4 grid as the catalog (TASK-415) — search results are
            the same cards, so they must not jump to a different column count
            than /products. Keep in sync with `SearchResultsSkeleton`. */}
        <div className="grid grid-cols-1 items-stretch gap-6 min-[390px]:grid-cols-2 lg:grid-cols-4">
          {products.map((product, index) => (
            <ProductCard
              key={product.id}
              product={product}
              priority={index < 4}
              action={<ProductCardActions product={product} />}
              hoverAction={<ProductQuickViewTrigger product={product} />}
            />
          ))}
        </div>
      </div>

      {totalPages > 1 && (
        <Pagination
          currentPage={currentPage}
          totalPages={totalPages}
          buildHref={buildPageHref}
        />
      )}
    </div>
  );

  return (
    <div>
      {/* Category chips — the catalogue's own row (TASK-523), writing
          ?category=<slug>. No per-category counts yet: those need facet counts
          from the search engine (TASK-1401). */}
      <CategoryChips
        categories={categories}
        activeCategorySlug={facets.category}
        onSelect={(category) => applyFilters({ category })}
      />

      {/* Toolbar: mobile filters button (left) + sort (right) */}
      <div className="mb-5 flex items-center gap-3">
        <button
          type="button"
          onClick={() => setFiltersOpen(true)}
          className="inline-flex h-11 items-center gap-2 rounded-xl border-2 border-border bg-card px-4 text-sm font-semibold text-foreground outline-none transition-colors hover:border-primary focus-visible:ring-2 focus-visible:ring-ring lg:hidden"
        >
          <SlidersHorizontal className="size-5" />
          {dict.filters.filtersButton}
          {activeFilterCount > 0 && (
            <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-xs font-bold text-primary-foreground">
              {activeFilterCount}
            </span>
          )}
        </button>

        <div className="ml-auto">
          <SearchSortSelect value={facets.sort} onChange={applyFilters} />
        </div>
      </div>

      {/* eslint-disable-next-line tailwindcss/no-arbitrary-value -- fixed+fluid column layout has no named grid-cols-N equivalent */}
      <div className="grid grid-cols-1 items-start gap-7 lg:grid-cols-[268px_1fr]">
        {/* Desktop sidebar */}
        <aside
          className={`hidden lg:sticky ${STICKY_ASIDE_TOP} ${ASIDE_SCROLL_BOX} lg:block lg:self-start`}
        >
          <ProductFilters
            idPrefix="search-filter"
            currentParams={panelParams}
            categoryId={activeCategoryId}
            onFilterChange={applyFilters}
            // GET /api/search takes neither `onSale` (TASK-742) nor `specs`
            // (TASK-523) — no control that the endpoint would ignore.
            hideOnSale
            hideSpecFacets
          />
        </aside>

        <section className="min-w-0">{results}</section>
      </div>

      {/* Mobile filters drawer — the shared one (TASK-804). Its zero-results
          reset clears every filter, the category included, and keeps the query
          (see `resetFilters`). */}
      <FiltersDrawer
        open={filtersOpen}
        onOpenChange={setFiltersOpen}
        resultCount={meta?.total}
        onReset={resetFilters}
        resetLabel={dict.catalog.clearAllFilters}
      >
        <ProductFilters
          idPrefix="search-filter-m"
          currentParams={panelParams}
          categoryId={activeCategoryId}
          onFilterChange={applyFilters}
          hideOnSale
          hideSpecFacets
          collapsible
        />
      </FiltersDrawer>
    </div>
  );
}
