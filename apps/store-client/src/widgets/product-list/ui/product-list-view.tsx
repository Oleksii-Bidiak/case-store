"use client";

import {
  useCallback,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
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
  CategoryTreePanel,
  CategoryTreePanelSkeleton,
  CategoryTreeSheet,
  categoryTreeHref,
  SortSelect,
  ViewToggle,
  FiltersDrawer,
  FiltersButton,
  MyDevicesEmptyState,
  useMyDevicesFilter,
  useCatalogDeviceParam,
  withCompatMarker,
  COMPAT_PARAM,
  clearFilterUpdates,
  countActiveFilters,
  hasActiveFilters,
  type CatalogView,
  type MyDevicesFilterDefault,
} from "@/features/product-filters";
import { dict } from "@/shared/config";
import { findCategoryNodeBySlug } from "../model/catalog-header";
import { buildCatalogListingParams } from "../model/listing-params";
import { ProductList } from "./product-list";

// Hydration flag (TASK-534): `false` for the server render and for hydration,
// `true` for every client render after that — and for a fresh client mount.
const subscribeNever = () => () => {};
const clientSnapshot = () => true;
const serverSnapshot = () => false;

/**
 * What a category change in the tree keeps of the current URL (TASK-2011,
 * CatalogNav §10.2): the view, the device and the sort order. Facets, price,
 * availability and the page belonged to the old category and are dropped.
 */
const CATEGORY_NAV_KEEP = [
  "view",
  "device",
  COMPAT_PARAM,
  "sortBy",
  "sortOrder",
] as const;

/** No default device filter — `/promo` and any route that does not opt in. */
const NO_MY_DEVICES_DEFAULT: Readonly<MyDevicesFilterDefault> = Object.freeze({
  on: false,
  scope: "active",
});

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
   * regardless of the URL query — the category tree marks it as the current
   * node and links out to the others' landing pages — and «скинути всі» clears
   * every other filter but never un-locks the category.
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
   *
   * No category tree either (TASK-2011): its links lead to landing pages
   * without the device, out of the compat page the route names.
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
   * the server render has it: the category tree's links go into the first
   * HTML and need no hydration gate. Pass it only when the prefetch actually succeeded
   * — claiming a tree the server did not have brings back TASK-534's mismatch.
   */
  categoryTreePrefetched?: boolean;
  /**
   * Where «З урахуванням моїх пристроїв» starts when the URL names no device
   * (Д3-2 Catalog §11/§20, TASK-2076): the «Мої пристрої» settings, read by
   * the route's client shell. Absent → no default (the filter starts off), as
   * on `/promo`. A route-locked device ignores it.
   */
  myDevicesDefault?: Readonly<MyDevicesFilterDefault>;
}

/**
 * Orchestrates the catalog page: keeps filter/sort/view state in the URL, fetches
 * the category tree, and renders the toolbar (sort + view toggle; below `lg`
 * also «Фільтри» and «Підкатегорії»), active-filter chips, the rail — the
 * category tree over the filters (TASK-2011) — with its mobile drawer and
 * sheet, and the results grid/list.
 */
export function ProductListView({
  lockedCategory,
  lockedDevice,
  lockedOnSale = false,
  anchorId,
  categoryTreePrefetched = false,
  myDevicesDefault = NO_MY_DEVICES_DEFAULT,
}: ProductListViewProps) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  const [filtersOpen, setFiltersOpen] = useState(false);
  const [treeOpen, setTreeOpen] = useState(false);
  const fragment = anchorId ? `#${anchorId}` : "";

  // Derive the active params from the live URL through the SAME builder the
  // server page prefetched the first page with (TASK-563): one set of rules on
  // both sides gives one React Query key, so the hydrated cards are this
  // query's own data — see `model/listing-params.ts` for why that matters.
  //
  // The one exception is `device=` (TASK-2077): with no device in the URL —
  // and no `compat=off` — the listing filters by the «Мої пристрої» default.
  // The saved devices are localStorage-only, so the server and the hydration
  // render list what the URL says; the default lands on the next render.
  const catalogDevice = useCatalogDeviceParam(
    searchParams.get("device"),
    searchParams.get(COMPAT_PARAM),
    myDevicesDefault,
  );
  const hasDeviceDefault = catalogDevice.hasDevices && myDevicesDefault.on;
  const readParam = (key: string) =>
    key === "device" ? (catalogDevice.device ?? null) : searchParams.get(key);
  const params = buildCatalogListingParams(readParam, {
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
  // the drawer or the category sheet being open, so a closed one never
  // subscribes. `keepPreviousData` holds the last count on screen while a
  // post-filter-change refetch is in flight instead of flashing to a loading
  // state.
  const { data: countData } = useProductControllerFindAll(params, {
    query: {
      enabled: filtersOpen || treeOpen,
      placeholderData: keepPreviousData,
    },
  });
  const resultCount = countData?.meta?.total;

  // Count of active filters INSIDE the drawer/sidebar — drives the mobile
  // "Filters" badge. The category is excluded: its control is the category
  // tree (the rail, its own sheet below `lg` — TASK-2011), not the drawer. Counted through the shared definition
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
    (rawUpdates: Record<string, string | undefined>) => {
      // Clearing `device=` where a default applies would only bring the
      // default straight back — so it also writes `compat=off`, and setting a
      // device drops the marker. Never on a route-locked device.
      const updates = lockedDevice
        ? rawUpdates
        : withCompatMarker(rawUpdates, hasDeviceDefault);
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
    [searchParams, pathname, router, fragment, lockedDevice, hasDeviceDefault],
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

  // The public tree carries every level (root + 3) in one payload, so the rail
  // tree needs no request per level. Only active categories are returned.
  const { data: categoriesData, isPending: categoriesPending } =
    useCategoryControllerGetCategoryTree();
  // TASK-534: without a prefetched tree the server renders this widget with no
  // tree. On the client the header's category menu can have fetched the same
  // tree before this Suspense boundary hydrates, and rendering the tree then
  // made the first child disagree with the server's — «Hydration failed», the
  // whole subtree thrown away. So until hydration is done, render exactly what
  // the server had. `/products`, `/categories/[slug]` and `/promo` prefetch the
  // tree (TASK-515) and say so: then the server HAD it, and its links are in
  // the first HTML.
  const hydrated = useSyncExternalStore(
    subscribeNever,
    clientSnapshot,
    serverSnapshot,
  );
  const treeReady = hydrated || categoryTreePrefetched;
  const categories = treeReady ? (categoriesData?.data ?? []) : [];
  // No tree yet → the panel's placeholder, not nothing (TASK-515): the filter
  // cards under it would otherwise rise and fall back when it landed.
  const categoryTreePending = !treeReady || categoriesPending;
  // The compat page fixes the device: a tree there would lead out of it.
  const withCategoryTree = !lockedDevice;

  // Where a tree node points (TASK-2011). The catalogue links each category to
  // its own landing page — the canonical address of that view, crawlable from
  // the rail; `/promo` has no per-category landing, so there the tree narrows
  // the deals by `?category=` and lands back on the listing's anchor.
  const categoryHref = useCallback(
    (slug: string | undefined) =>
      categoryTreeHref(slug, searchParams, {
        target: lockedOnSale ? { path: pathname } : "landing",
        keep: CATEGORY_NAV_KEEP,
        fragment,
      }),
    [searchParams, pathname, lockedOnSale, fragment],
  );

  // Slug → id, once, for the id-addressed side endpoints (brands-per-category,
  // filterable specs) that the TASK-420 URL migration did not touch. Resolved
  // from the tree this widget already fetches, so it costs no extra request; on
  // a landing page the route hands us the id directly and no lookup is needed.
  const activeCategoryId =
    lockedCategory?.id ??
    (params.category
      ? findCategoryNodeBySlug(categories, params.category)?.id
      : undefined);

  // «З урахуванням моїх пристроїв» (TASK-2077): the filter is on for one saved
  // device and nothing fits — say so and offer the way out (Catalog §14 A),
  // rather than the generic «nothing matches the filters». The card itself
  // falls back to the generic state when the listing is empty even without
  // the device (a keyword, a price range…): then the device is not why.
  const myDevices = useMyDevicesFilter(
    lockedDevice ? undefined : params.device,
  );
  const activeMyDevice =
    myDevices.state.mode === "active" ? myDevices.state.device : null;
  const myDeviceEmpty = activeMyDevice
    ? (generic: ReactNode) => (
        <MyDevicesEmptyState
          device={activeMyDevice}
          devices={myDevices.devices}
          currentParams={params}
          categoryName={
            params.category
              ? findCategoryNodeBySlug(categories, params.category)?.name
              : undefined
          }
          onFilterChange={applyFilters}
          fallback={generic}
        />
      )
    : undefined;

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
      {/* Toolbar: «Фільтри» + «Підкатегорії · N» (below `lg`, where the rail
          is hidden) and sort + view toggle. The view toggle stays at every
          width (TASK-1958). Below `md` the two buttons share the first row
          half and half and sort + view wrap to a second row (CatalogNav §4);
          from `md` it is one row. Without the tree (compat pages) it is the
          one-row toolbar it always was. */}
      <div className="mb-5 flex flex-wrap items-center gap-2 sm:gap-3">
        <div
          className={`flex gap-2 sm:gap-3 lg:hidden ${withCategoryTree ? "w-full md:w-auto" : ""}`}
        >
          <FiltersButton
            activeCount={activeFilterCount}
            onClick={() => setFiltersOpen(true)}
            className={withCategoryTree ? "flex-1 md:flex-none" : undefined}
          />
          {withCategoryTree && (
            <CategoryTreeSheet
              open={treeOpen}
              onOpenChange={setTreeOpen}
              pending={categoryTreePending}
              categories={categories}
              currentSlug={params.category}
              hrefFor={categoryHref}
              resultCount={resultCount}
              className="flex-1 md:flex-none"
            />
          )}
        </div>

        {/* `min-w-0` lets the sort trigger shrink on a 320px phone (it
            truncates its label) instead of widening the page; the view
            toggle beside it keeps its size. */}
        <div className="ml-auto flex min-w-0 items-center gap-2 sm:gap-3">
          <SortSelect currentSort={currentSort} onChange={applyFilters} />
          <ViewToggle view={view} onChange={setView} />
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
        {/* Desktop rail: the category tree (TASK-2011), «З урахуванням моїх
            пристроїв», then the filters (Catalog §9.1). It grows with the page
            instead of being a sticky box that scrolls inside itself: with the
            tree on top, a capped sticky rail hid every filter below its own
            fold, where page scroll never reaches. */}
        <aside className="hidden lg:flex lg:flex-col lg:gap-3 lg:self-start">
          {withCategoryTree &&
            (categoryTreePending ? (
              <CategoryTreePanelSkeleton />
            ) : (
              <CategoryTreePanel
                categories={categories}
                currentSlug={params.category}
                hrefFor={categoryHref}
              />
            ))}
          <ProductFilters
            currentParams={params}
            categoryId={activeCategoryId}
            lockedDevice={Boolean(lockedDevice)}
            lockedOnSale={lockedOnSale}
            onFilterChange={applyFilters}
            withMyDevices
          />
        </aside>

        <section className="min-w-0">
          <ProductList
            params={params}
            buildPageHref={buildPageHref}
            view={view}
            empty={
              myDeviceEmpty
                ? { ...emptyState, custom: myDeviceEmpty }
                : emptyState
            }
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
          withMyDevices
        />
      </FiltersDrawer>
    </div>
  );
}
