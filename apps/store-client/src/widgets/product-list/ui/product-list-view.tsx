"use client";

import { useCallback, useState, useSyncExternalStore } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { keepPreviousData } from "@tanstack/react-query";
import { useCategoryControllerGetCategoryTree } from "@/entities/category";
import { useBrandControllerFindAll } from "@/entities/brand";
import {
  useProductControllerFindAll,
  type ProductControllerFindAllParams,
} from "@/entities/product";
import {
  ProductFilters,
  ActiveFilterChips,
  CategoryChips,
  CategoryChipsSkeleton,
  SortSelect,
  ViewToggle,
  FiltersDrawer,
  FiltersButton,
  clearFilterUpdates,
  countActiveFilters,
  hasActiveFilters,
  type CatalogView,
} from "@/features/product-filters";
import { dict, STICKY_ASIDE_TOP } from "@/shared/config";
import { findCategoryNodeBySlug } from "../model/catalog-header";
import { buildCatalogListingParams } from "../model/listing-params";
import { ProductList } from "./product-list";

// Hydration flag (TASK-534): `false` for the server render and for hydration,
// `true` for every client render after that — and for a fresh client mount.
const subscribeNever = () => () => {};
const clientSnapshot = () => true;
const serverSnapshot = () => false;

interface ProductListViewProps {
  /**
   * Server-resolved params of the first render. No longer read (TASK-563): the
   * widget derives its params from the URL through `buildCatalogListingParams`,
   * the builder the server prefetches with, so the two cannot disagree. Optional
   * and kept only for `/catalog/[category]/[device]`, which still passes it.
   */
  initialParams?: ProductControllerFindAllParams;
  /**
   * Fix the category to the one the route names (TASK-277 — `/categories/[slug]`
   * landing pages). When set: the effective category is always this one
   * regardless of the URL query, the `CategoryChips` switcher row is not
   * rendered (the landing page has its own `SubcategoryChips` navigation), and
   * «скинути всі» clears every other filter but never un-locks the category.
   * When unset (`/products`), behavior is unchanged.
   *
   * Both halves are needed since TASK-420: the `slug` is what the listing query
   * is filtered by, the `id` is what the id-addressed side endpoints (brands per
   * category, filterable specs) take.
   */
  lockedCategory?: { id: string; slug: string };
  /**
   * Fix the compatible device to the one the route names — the second segment
   * of `/catalog/[category]/[device]` (TASK-490, «Чохли для iPhone 15 Pro»).
   *
   * The exact twin of `lockedCategory` one axis over: the effective device is
   * always this one whatever the query string says, the «Сумісний пристрій»
   * control disappears from the panel, no removable device chip is offered, and
   * «скинути всі» clears everything else but never un-locks the device. Without
   * it the sidebar would let a shopper switch to another model while the URL,
   * the H1, the `<title>` and the canonical all kept naming the old one.
   */
  lockedDevice?: { slug: string };
  /**
   * Fix the listing to discounted positions — `/promo` «Товари зі знижкою»
   * (TASK-1301). The page reuses the whole catalogue (rail, drawer, chips, sort,
   * view toggle, load-more + pagination) instead of a grid of its own, with the
   * discount as a route lock: the «Зі знижкою» section and chip disappear, the
   * drawer badge does not count it, and «скинути всі» never lifts it.
   */
  lockedOnSale?: boolean;
  /**
   * Id of the element every URL this listing writes points back at — filters,
   * sort, view and the page links (TASK-1301). Next scrolls a search-param
   * navigation to the top of the page; on `/products` that is where the
   * toolbar is, but on `/promo` the listing sits under the hero and coupons,
   * and each chip click flung the shopper back up to the hero. With an anchor
   * the navigation lands on the listing's own section instead.
   */
  anchorId?: string;
  /**
   * The route put the category tree into its `PrefetchBoundary` (TASK-515), so
   * the server render has it: the category chips go into the first HTML and
   * need no hydration gate. Pass it only when the prefetch actually succeeded
   * — claiming a tree the server did not have brings back TASK-534's mismatch.
   */
  categoryTreePrefetched?: boolean;
}

/**
 * Orchestrates the catalog page: keeps filter/sort/view state in the URL, fetches
 * categories for the chips row, and renders the category chips (TASK-216 — the
 * category selector moved out of the sidebar into a horizontal row above the
 * grid), the toolbar (sort + view toggle + mobile filters), active-filter chips,
 * the sidebar (desktop aside + mobile drawer) and the results grid/list.
 */
export function ProductListView({
  lockedCategory,
  lockedDevice,
  lockedOnSale = false,
  anchorId,
  categoryTreePrefetched = false,
}: ProductListViewProps) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  const [filtersOpen, setFiltersOpen] = useState(false);
  const fragment = anchorId ? `#${anchorId}` : "";

  // Derive the active params from the live URL through the SAME builder the
  // server page prefetched the first page with (TASK-563): one set of rules on
  // both sides gives one React Query key, so the hydrated cards are this
  // query's own data — see `model/listing-params.ts` for why that matters.
  const params = buildCatalogListingParams((key) => searchParams.get(key), {
    categorySlug: lockedCategory?.slug,
    deviceSlug: lockedDevice?.slug,
    onSale: lockedOnSale,
  });

  const view: CatalogView =
    searchParams.get("view") === "list" ? "list" : "grid";
  const currentSort = `${params.sortBy}:${params.sortOrder}`;

  // Live result count for the mobile drawer's sticky "Apply" button (TASK-084).
  // Same `params` (and therefore React Query cache key) the grid already fetches,
  // so a warm cache resolves it with zero extra network round trips; gated on
  // `filtersOpen` so a closed drawer never subscribes. `keepPreviousData` holds
  // the last count on screen while a post-filter-change refetch is in flight
  // instead of flashing to a loading state.
  const { data: countData } = useProductControllerFindAll(params, {
    query: { enabled: filtersOpen, placeholderData: keepPreviousData },
  });
  const resultCount = countData?.meta?.total;

  // Count of active filters INSIDE the drawer/sidebar — drives the mobile
  // "Filters" badge. The category is excluded: its control is the always-visible
  // chips row, not the drawer (TASK-216). Counted through the shared definition
  // (TASK-414) so the badge cannot silently omit a filter the panel offers —
  // which is exactly how `specs` went uncounted.
  const activeFilterCount = countActiveFilters(params, {
    includeCategory: false,
    // A route-locked device is not a filter the drawer can change (TASK-490),
    // so badging it would promise a control that is not in there.
    includeDevice: !lockedDevice,
    includeOnSale: !lockedOnSale,
  });

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
      router.replace(`${pathname}?${next.toString()}${fragment}`);
    },
    [searchParams, pathname, router, fragment],
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
      router.replace(`${pathname}?${next.toString()}${fragment}`);
    },
    [searchParams, pathname, router, fragment],
  );

  const clearFilters = useCallback(() => {
    // Whatever the route fixes — the category on a category landing page, the
    // category AND the device on a compat one — is not a clearable filter:
    // «скинути всі» drops everything else but never un-locks a segment.
    applyFilters(
      clearFilterUpdates({
        includeCategory: !lockedCategory,
        includeDevice: !lockedDevice,
        includeOnSale: !lockedOnSale,
      }),
    );
  }, [applyFilters, lockedCategory, lockedDevice, lockedOnSale]);

  // The empty state's one primary action (TASK-870, design-system §6). A reset
  // only when it would change something — the same «what is clearable» rule
  // `clearFilters` applies, route locks excluded. With nothing to drop (an
  // empty landing page, nothing on sale) a reset button is a no-op, so the
  // action leads out to the whole catalogue instead — or home, on the
  // catalogue itself, where a link to /products would point at this page.
  const canClearFilters = hasActiveFilters(params, {
    includeCategory: !lockedCategory,
    includeDevice: !lockedDevice,
    includeOnSale: !lockedOnSale,
  });
  const emptyState = canClearFilters
    ? {
        heading: dict.catalog.emptyHeading,
        body: dict.catalog.emptyBody,
        action: { label: dict.catalog.clearAllFilters, onClick: clearFilters },
      }
    : lockedOnSale
      ? {
          heading: dict.promo.dealsEmptyHeading,
          body: dict.promo.dealsEmptyBody,
          action: { label: dict.promo.dealsEmptyCta, href: "/products" },
        }
      : {
          heading: dict.catalog.emptyHeading,
          body: dict.catalog.emptyUnfilteredBody,
          action:
            pathname === "/products"
              ? { label: dict.common.goHome, href: "/" }
              : { label: dict.catalog.emptyBrowseAll, href: "/products" },
        };

  const buildPageHref = useCallback(
    (targetPage: number) => {
      const next = new URLSearchParams(searchParams.toString());
      next.set("page", String(targetPage));
      return `${pathname}?${next.toString()}${fragment}`;
    },
    [searchParams, pathname, fragment],
  );

  // The public tree carries roots + their children in one payload, so the chips
  // row can offer a second, "narrow to a subcategory" level without a second
  // request (TASK-236). Only active categories are returned.
  const { data: categoriesData, isPending: categoriesPending } =
    useCategoryControllerGetCategoryTree();
  // TASK-534: without a prefetched tree the server renders this widget with no
  // tree. On the client the header's category menu can have fetched the same
  // tree before this Suspense boundary hydrates, and rendering the chips then
  // made the first child disagree with the server's — «Hydration failed», the
  // whole subtree thrown away. So until hydration is done, render exactly what
  // the server had. `/products` and `/promo` prefetch the tree (TASK-515) and
  // say so: then the server HAD it, and the chips are in the first HTML.
  const hydrated = useSyncExternalStore(
    subscribeNever,
    clientSnapshot,
    serverSnapshot,
  );
  const treeReady = hydrated || categoryTreePrefetched;
  const categories = treeReady ? (categoriesData?.data ?? []) : [];
  // No tree yet → the row's placeholder, not nothing (TASK-515). The chips row
  // is 60px of the page above the toolbar and the grid; rendering nothing until
  // the tree landed pulled both up out of the skeleton's place and then pushed
  // them back down. A tree that failed to load leaves the row out.
  const categoryChipsPending = !treeReady || categoriesPending;

  // Slug → id, once, for the id-addressed side endpoints (brands-per-category,
  // filterable specs) that the TASK-420 URL migration did not touch. Resolved
  // from the tree this widget already fetches, so it costs no extra request; on
  // a landing page the route hands us the id directly and no lookup is needed.
  const activeCategoryId =
    lockedCategory?.id ??
    (params.category
      ? findCategoryNodeBySlug(categories, params.category)?.id
      : undefined);

  // Active brands power both the sidebar «Виробник» select and the removable
  // brand chip's label (slug → name). One shared query, deduped by React Query.
  // Same category scope the sidebar's BrandFilter uses (TASK-414) — one shared
  // query key, so the chip label resolves from the very slice the dropdown
  // offered rather than from a second, wider list.
  const { data: brandsData } = useBrandControllerFindAll(
    activeCategoryId ? { categoryId: activeCategoryId } : undefined,
  );
  const activeBrandName = params.brand
    ? brandsData?.data.find((brand) => brand.slug === params.brand)?.name
    : undefined;

  return (
    <div>
      {/* Category chips — horizontal, scrollable on mobile; drives ?category=.
          Hidden when the category is locked by the route (/categories/[slug]):
          switching categories there is SubcategoryChips' navigation job. */}
      {/* A selected category opens the subcategory row (its children or its
          siblings), so the placeholder reserves it too; only a childless root
          guesses wrong, by one row. */}
      {!lockedCategory && categoryChipsPending && (
        <CategoryChipsSkeleton withSubcategories={Boolean(params.category)} />
      )}
      {!lockedCategory && !categoryChipsPending && (
        <CategoryChips
          categories={categories}
          activeCategorySlug={params.category}
          // Changing (or clearing) the category also drops any spec facet — facet
          // options are category-scoped and meaningless without one (TASK-191).
          onSelect={(category) => applyFilters({ category, specs: undefined })}
        />
      )}

      {/* Toolbar: mobile filters button (left) + view toggle + sort (right) */}
      <div className="mb-5 flex items-center gap-3">
        <FiltersButton
          activeCount={activeFilterCount}
          onClick={() => setFiltersOpen(true)}
        />

        {/* `min-w-0` lets the sort trigger shrink on a 320px phone (it
            truncates its label) instead of widening the page; the filters
            button beside it keeps its size. */}
        <div className="ml-auto flex min-w-0 items-center gap-3">
          <ViewToggle
            view={view}
            onChange={setView}
            className="hidden lg:flex"
          />
          <SortSelect currentSort={currentSort} onChange={applyFilters} />
        </div>
      </div>

      <ActiveFilterChips
        currentParams={params}
        brandName={activeBrandName}
        categoryId={activeCategoryId}
        lockedDevice={Boolean(lockedDevice)}
        lockedOnSale={lockedOnSale}
        onFilterChange={applyFilters}
      />

      {/* eslint-disable-next-line tailwindcss/no-arbitrary-value -- fixed+fluid column layout has no named grid-cols-N equivalent */}
      <div className="grid grid-cols-1 items-start gap-7 lg:grid-cols-[268px_1fr]">
        {/* Desktop sidebar. A sticky aside with no height cap runs off a short
            viewport, and page scroll never brings the overflow back — so it is
            capped at `max-h-sticky-aside` and scrolls inside itself (TASK-414). */}
        <aside
          className={`hidden lg:sticky ${STICKY_ASIDE_TOP} lg:block lg:max-h-sticky-aside lg:self-start lg:overflow-y-auto lg:overscroll-contain`}
        >
          <ProductFilters
            currentParams={params}
            categoryId={activeCategoryId}
            lockedDevice={Boolean(lockedDevice)}
            lockedOnSale={lockedOnSale}
            onFilterChange={applyFilters}
          />
        </aside>

        <section className="min-w-0">
          <ProductList
            params={params}
            buildPageHref={buildPageHref}
            view={view}
            empty={emptyState}
          />
        </section>
      </div>

      {/* Mobile filters drawer — the shared one (TASK-804). At zero results
          its footer offers the SAME reset as the empty state under it, which
          used to be reachable only after closing the drawer. */}
      <FiltersDrawer
        open={filtersOpen}
        onOpenChange={setFiltersOpen}
        resultCount={resultCount}
        onReset={clearFilters}
        resetLabel={dict.catalog.clearAllFilters}
      >
        <ProductFilters
          idPrefix="filter-m"
          currentParams={params}
          categoryId={activeCategoryId}
          lockedDevice={Boolean(lockedDevice)}
          lockedOnSale={lockedOnSale}
          onFilterChange={applyFilters}
          collapsible
        />
      </FiltersDrawer>
    </div>
  );
}
