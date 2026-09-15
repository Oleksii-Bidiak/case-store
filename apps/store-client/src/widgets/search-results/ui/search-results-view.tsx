"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Loader2, SlidersHorizontal } from "lucide-react";
import { useSearch } from "@/entities/search";
import type { ProductControllerFindAllParams } from "@/entities/product";
import { ProductFilters, countActiveFilters } from "@/features/product-filters";
import {
  ProductCard,
  Sheet,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/shared/ui";
import { Pagination } from "@/shared/ui/pagination";
import { ProductCardActions } from "@/widgets/product-card-actions";
import { ProductQuickViewTrigger } from "@/widgets/product-quick-view";
import { dict, STICKY_ASIDE_TOP } from "@/shared/config";
import { trackEvent } from "@/shared/lib";
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
 * Two filters the panel offers are deliberately NOT wired here: the category
 * (the search endpoint takes a category id, but nothing on this page picks one
 * — so the panel is given no `categoryId`, which in turn keeps the
 * category-scoped spec facets hidden rather than showing controls the endpoint
 * would ignore). See TASK-523.
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
    brand: facets.brand,
    device: facets.device,
    minPrice: facets.minPrice,
    maxPrice: facets.maxPrice,
    inStock: facets.inStock,
  };

  // Badge on the mobile «Фільтри» button. Counted through the shared definition
  // (TASK-414) and without the keyword, which is the query rather than a filter.
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
            onFilterChange={applyFilters}
          />
        </aside>

        <section className="min-w-0">{results}</section>
      </div>

      {/* Mobile filters drawer */}
      <Sheet open={filtersOpen} onOpenChange={setFiltersOpen}>
        <SheetContent
          side="left"
          // `overscroll-contain` stops iOS Safari scroll-chaining — dragging
          // past the end of the filter list must not rubber-band the page
          // underneath the open drawer.
          className="w-86 max-w-full gap-0 overflow-y-auto overscroll-contain p-0"
        >
          <SheetHeader className="border-b border-border">
            <SheetTitle className="font-display text-lg font-bold">
              {dict.filters.legend}
            </SheetTitle>
          </SheetHeader>
          <div className="p-4">
            <ProductFilters
              idPrefix="search-filter-m"
              currentParams={panelParams}
              onFilterChange={applyFilters}
              collapsible
            />
          </div>
          <SheetFooter className="border-t border-border">
            <button
              type="button"
              onClick={() => setFiltersOpen(false)}
              className="h-12 w-full rounded-xl bg-primary text-base font-bold text-primary-foreground transition-colors hover:bg-primary/90"
            >
              {meta?.total == null
                ? dict.filters.mobileApplyPending
                : dict.filters.mobileApply(meta.total)}
            </button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </div>
  );
}
