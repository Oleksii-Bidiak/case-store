"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ArrowRight, Check, Heart, Search, ShoppingCart } from "lucide-react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { useGetWishlist } from "@/entities/wishlist";
import { useAuth } from "@/entities/session";
import { getGetCartQueryKey, useAddToCart, useGetCart } from "@/entities/cart";
import { getDeviceFamilyTone } from "@/entities/device";
import {
  EMPTY_DEVICES,
  useMyDevices,
  useMyDevicesHydrated,
} from "@/entities/my-devices";
import { deviceHubHref, deviceShortName } from "@/features/device-fit";
import {
  FilterChipList,
  FiltersButton,
  FiltersDrawer,
  ListingEmptyState,
  SortSelect,
  ViewToggle,
  type CatalogView,
  type FilterChip,
  type SortOption,
} from "@/features/product-filters";
import { Button } from "@/shared/ui";
import { Pagination } from "@/shared/ui/pagination";
import { formatMoney } from "@/shared/lib";
import { dict, STICKY_ASIDE_TOP, H1_CLASS } from "@/shared/config";
import { PRODUCT_GRID_CLASS } from "@/shared/config/product-grid";
import {
  DEFAULT_WISHLIST_SORT,
  EMPTY_WISHLIST_FILTERS,
  collectFacetOptions,
  countActiveWishlistFilters,
  effectiveWishlistFilters,
  filterWishlistItems,
  isInStock,
  isWishlistSortKey,
  paginateWishlist,
  parsePageParam,
  sortWishlistItems,
  wishlistPriceDomain,
  withRestoredDates,
  type WishlistFilterState,
  type WishlistSortKey,
} from "../model/wishlist-catalog";
import { useWishlistFacets } from "../model/use-wishlist-facets";
import { useWishlistRemoval } from "../model/use-wishlist-removal";
import { WishlistItemCard } from "./wishlist-item-card";
import { WishlistListItem } from "./wishlist-list-item";
import { WishlistFilters } from "./wishlist-filters";
import { WishlistDevicesPanel } from "./wishlist-devices-panel";
import { WishlistSkeleton } from "./wishlist-skeleton";

const SORT_OPTIONS: readonly SortOption[] = [
  { value: "createdAt:desc", label: dict.wishlist.sort.recent },
  { value: "price:asc", label: dict.wishlist.sort.priceAsc },
  { value: "price:desc", label: dict.wishlist.sort.priceDesc },
  { value: "discount:desc", label: dict.wishlist.sort.sale },
];

/**
 * WishlistView — `/wishlist` as «каталог №2» (TASK-1300; Д3-2 Wishlist.dc.html).
 * Reads the saved products (guest or user) via the cached useGetWishlist query
 * and runs the catalogue's pattern over that list, client-side (owner's call):
 * the same toolbar (filters button, sort, grid/list toggle), the same card and
 * action block, a rail of «З урахуванням моїх пристроїв» (OFF by default — a
 * wishlist holds things for the whole family), quick filters, category, brand
 * and a two-thumb price, active-filter chips, «Показати ще» + pages, and
 * «Додати все в кошик · N» in the head.
 *
 * Removing is the heart on a card: at once, with «Повернути» in a toast —
 * never a confirm dialog (`useWishlistRemoval`).
 *
 * State: filters, sort and view are component state — a lens on a personal
 * list, not a shareable listing. The PAGE is the URL (`?page=`), so the shared
 * link-based `Pagination` works and Back returns to the page the shopper was
 * on; any filter or sort change drops it back to the first page. «Показати
 * ще» appends the following pages in place, keyed by the result set through a
 * render-time guard (docs/conventions/forms.md), like the catalogue.
 *
 * The device list is browser-local (`entities/my-devices`) and the page is
 * client-only, so nothing personal reaches cached HTML.
 */
export function WishlistView() {
  // Hold the query until auth bootstrap settles so the page never flashes a
  // transient empty guest wishlist minted during refresh (TASK-118 pattern).
  const { isInitializing, isAuthenticated } = useAuth();
  const { data, isPending, isError } = useGetWishlist({
    query: { enabled: !isInitializing },
  });
  const { data: cartData } = useGetCart({
    query: { enabled: !isInitializing },
  });
  const queryClient = useQueryClient();
  const addToCart = useAddToCart();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const requestedPage = parsePageParam(searchParams.get("page"));

  const devicesHydrated = useMyDevicesHydrated();
  const savedDevices = useMyDevices();
  const devices = devicesHydrated ? savedDevices : EMPTY_DEVICES;
  const activeDevice = devices[0] ?? null;
  const deviceModelIds = useMemo(
    () => devices.map((device) => device.modelId),
    [devices],
  );

  const removal = useWishlistRemoval();

  const [view, setView] = useState<CatalogView>("grid");
  const [sortKey, setSortKey] = useState<WishlistSortKey>(
    DEFAULT_WISHLIST_SORT,
  );
  const [filters, setFilters] = useState<WishlistFilterState>(
    EMPTY_WISHLIST_FILTERS,
  );
  const [filtersOpen, setFiltersOpen] = useState(false);

  // Only fully-hydrated items (a slug) render; optimistic placeholders are
  // dropped. A product brought back by «Повернути» reads its first-saved date.
  const items = useMemo(
    () =>
      withRestoredDates(
        (data?.data?.items ?? []).filter((item) => Boolean(item.productSlug)),
        removal.restoredAt,
      ),
    [data, removal.restoredAt],
  );
  const productIds = useMemo(
    () => items.map((item) => item.productId),
    [items],
  );
  const { facetsById, categoryNames } = useWishlistFacets(productIds);

  const categoryOptions = useMemo(
    () =>
      collectFacetOptions(items, facetsById, (facets) => {
        const name = facets.categoryId
          ? categoryNames.get(facets.categoryId)
          : undefined;
        return facets.categoryId && name
          ? { id: facets.categoryId, label: name }
          : undefined;
      }),
    [items, facetsById, categoryNames],
  );
  const brandOptions = useMemo(
    () =>
      collectFacetOptions(items, facetsById, (facets) =>
        facets.brandId && facets.brandName
          ? { id: facets.brandId, label: facets.brandName }
          : undefined,
      ),
    [items, facetsById],
  );
  const priceDomain = useMemo(() => wishlistPriceDomain(items), [items]);

  // The device switch counts only with a saved device to apply.
  const applied = effectiveWishlistFilters(filters, devices.length);
  const matching = useMemo(
    () =>
      sortWishlistItems(
        filterWishlistItems(items, applied, facetsById, deviceModelIds),
        sortKey,
      ),
    [items, applied, facetsById, deviceModelIds, sortKey],
  );
  const activeFilterCount = countActiveWishlistFilters(applied);

  // «Показати ще» appends pages to the URL's page. The appended count belongs
  // to one result set; a mismatched key (filters, sort or page changed) reads
  // as zero — a render-time guard, not an effect. The list's length is left
  // out on purpose: removing one card must not collapse the appended pages
  // (`paginateWishlist` clamps if the list shrinks below them).
  const resultKey = JSON.stringify([applied, sortKey, requestedPage]);
  const [appended, setAppended] = useState({ key: resultKey, pages: 0 });
  const extraPages = appended.key === resultKey ? appended.pages : 0;
  const page = paginateWishlist(matching, requestedPage, extraPages);

  if (isInitializing || isPending) {
    return <WishlistSkeleton />;
  }

  if (isError) {
    return (
      <p role="alert" className="text-sm text-destructive">
        {dict.wishlist.error}
      </p>
    );
  }

  // The trail is the same in every loaded state, so the page never loses its
  // «Обране» landmark (TASK-875).
  const breadcrumb = (
    <nav
      aria-label={dict.product.breadcrumbAria}
      className="mb-4.5 flex items-center gap-2.5 text-sm text-muted-foreground"
    >
      <Link
        href="/"
        className="rounded-sm underline-offset-3 transition-colors outline-none hover:text-foreground hover:underline focus-visible:ring-2 focus-visible:ring-ring"
      >
        {dict.wishlist.breadcrumbHome}
      </Link>
      <span aria-hidden="true" className="opacity-50">
        ›
      </span>
      <span aria-current="page" className="font-semibold text-foreground">
        {dict.wishlist.heading}
      </span>
    </nav>
  );

  // Nothing saved at all. The page keeps its trail and its h1 «Обране» (owner
  // 7.11, TASK-875); the card's line is a sub-heading. The way out leads to
  // what fits the shopper's device when one is saved (Д3-2 §18.7).
  if (items.length === 0) {
    const cta = activeDevice
      ? {
          href: deviceHubHref(activeDevice.slug),
          label: dict.wishlist.emptyDeviceCta(
            deviceShortName(activeDevice.name),
          ),
        }
      : { href: "/products", label: dict.wishlist.emptyCta };
    return (
      <div>
        {breadcrumb}
        <h1 className={`${H1_CLASS} mb-6 text-foreground`}>
          {dict.wishlist.heading}
        </h1>
        <div className="flex flex-col items-center gap-3 rounded-card bg-card px-5 py-10 text-center shadow-card">
          <span
            aria-hidden="true"
            className="inline-flex size-16 items-center justify-center rounded-pad bg-muted text-badge"
          >
            <Heart className="size-7" strokeWidth={1.8} />
          </span>
          <h2 className="mt-1 font-display text-xl leading-tight font-bold text-foreground">
            {dict.wishlist.emptyHeading}
          </h2>
          <p className="max-w-md text-base text-muted-foreground">
            {dict.wishlist.emptyBody}
          </p>
          <Button asChild size="lg" className="mt-2 h-12 rounded-full px-6">
            <Link href={cta.href}>
              {cta.label}
              <ArrowRight aria-hidden="true" className="size-4" />
            </Link>
          </Button>
        </div>
      </div>
    );
  }

  /** Back to page one (the URL owns it) whenever the result set changes. */
  const resetPage = () => {
    if (requestedPage > 1) {
      router.replace(pathname, { scroll: false });
    }
  };

  const updateFilters = (next: WishlistFilterState) => {
    setFilters(next);
    resetPage();
  };

  // Facets, price AND the device switch — «Очистити все» turns it off too.
  const clearFilters = () => updateFilters(EMPTY_WISHLIST_FILTERS);

  const chips: FilterChip[] = [];
  if (applied.devicesOnly) {
    const single = devices.length === 1 ? devices[0] : null;
    chips.push({
      key: "devices",
      label: single
        ? dict.filters.myDevices.chipFor(deviceShortName(single.name))
        : dict.wishlist.devices.chipMany(devices.length),
      ariaLabel: dict.filters.myDevices.chipRemoveAria,
      // One device: its family tone and dot, like the catalogue's chip.
      toneClassName: single
        ? getDeviceFamilyTone(single.family).surface
        : undefined,
      dotClassName: single
        ? getDeviceFamilyTone(single.family).strong
        : undefined,
      onRemove: () => updateFilters({ ...filters, devicesOnly: false }),
    });
  }
  if (filters.saleOnly) {
    chips.push({
      key: "sale",
      label: dict.wishlist.quickSale,
      onRemove: () => updateFilters({ ...filters, saleOnly: false }),
    });
  }
  if (filters.inStockOnly) {
    chips.push({
      key: "stock",
      label: dict.wishlist.quickInStock,
      onRemove: () => updateFilters({ ...filters, inStockOnly: false }),
    });
  }
  for (const id of filters.categoryIds) {
    chips.push({
      key: `category:${id}`,
      label: dict.wishlist.categoryChip(categoryNames.get(id) ?? "…"),
      onRemove: () =>
        updateFilters({
          ...filters,
          categoryIds: filters.categoryIds.filter((other) => other !== id),
        }),
    });
  }
  for (const id of filters.brandIds) {
    const brand = brandOptions.find((option) => option.id === id);
    chips.push({
      key: `brand:${id}`,
      label: `${dict.filters.brandTitle}: ${brand?.label ?? "…"}`,
      onRemove: () =>
        updateFilters({
          ...filters,
          brandIds: filters.brandIds.filter((other) => other !== id),
        }),
    });
  }
  if (filters.minPrice != null || filters.maxPrice != null) {
    chips.push({
      key: "price",
      label: dict.wishlist.priceRangeChip(
        formatMoney(String(filters.minPrice ?? 0)),
        formatMoney(String(filters.maxPrice ?? priceDomain)),
      ),
      onRemove: () =>
        updateFilters({
          ...filters,
          minPrice: undefined,
          maxPrice: undefined,
        }),
    });
  }

  // «Додати все в кошик · N» — every in-stock item the filters leave, not
  // just the page on screen. Once they all sit in the cart (the header
  // badge's cached query) the button turns into «✓ Усе в кошику».
  const cartProductIds = new Set(
    (cartData?.data?.items ?? []).map((line) => line.productId),
  );
  const buyable = matching.filter(isInStock);
  const toAdd = buyable.filter((item) => !cartProductIds.has(item.productId));
  const allInCart = buyable.length > 0 && toAdd.length === 0;

  async function addAllToCart() {
    if (toAdd.length === 0) {
      toast(dict.wishlist.addAllNone);
      return;
    }
    try {
      await Promise.all(
        toAdd.map((item) =>
          addToCart.mutateAsync({
            data: { productId: item.productId, quantity: 1 },
          }),
        ),
      );
      toast.success(dict.wishlist.addAllDone);
    } catch {
      toast.error(dict.addToCart.error);
    } finally {
      void queryClient.invalidateQueries({ queryKey: getGetCartQueryKey() });
    }
  }

  const buildPageHref = (target: number) =>
    target > 1 ? `${pathname}?page=${target}` : pathname;

  const subline =
    devices.length > 0
      ? dict.wishlist.subWithDevice
      : !isAuthenticated
        ? dict.wishlist.subGuest
        : null;

  const rail = (idPrefix: string, collapsible: boolean) => (
    <>
      <WishlistDevicesPanel
        hydrated={devicesHydrated}
        devices={devices}
        on={applied.devicesOnly}
        onChange={(on) => updateFilters({ ...filters, devicesOnly: on })}
        idPrefix={idPrefix}
      />
      <WishlistFilters
        idPrefix={idPrefix}
        collapsible={collapsible}
        items={items}
        categoryOptions={categoryOptions}
        brandOptions={brandOptions}
        priceDomain={priceDomain}
        value={filters}
        onChange={updateFilters}
      />
    </>
  );

  return (
    <div>
      {breadcrumb}

      {/* Head: «Обране N» + the line about the fit marks, and the one bulk
          action on the right (Д3-2 §18.1). */}
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-baseline gap-x-2">
            <h1 className={`${H1_CLASS} text-foreground`}>
              {dict.wishlist.heading}
            </h1>
            <span className="text-base font-semibold text-muted-foreground tabular-nums">
              <span aria-hidden="true">{items.length}</span>
              <span className="sr-only">
                {dict.wishlist.headCountAria(items.length)}
              </span>
            </span>
          </div>
          {subline && (
            <p className="mt-1.5 text-sm text-muted-foreground">{subline}</p>
          )}
        </div>

        {allInCart ? (
          <Button
            asChild
            variant="outline"
            className="h-11 rounded-full px-4.5 text-success hover:text-success"
          >
            <Link href="/cart" aria-label={dict.wishlist.addAllInCartAria}>
              <Check aria-hidden="true" className="size-4" />
              {dict.wishlist.addAllInCart}
            </Link>
          </Button>
        ) : (
          buyable.length > 0 && (
            <Button
              type="button"
              onClick={() => void addAllToCart()}
              disabled={addToCart.isPending}
              className="h-11 rounded-full px-4.5 text-base font-semibold"
            >
              <ShoppingCart aria-hidden="true" className="size-4" />
              {dict.wishlist.addAllCount(buyable.length)}
            </Button>
          )
        )}
      </div>

      {/* Toolbar (Д3-2 §18.2): «Фільтри» below `lg`, the «7 з 9» count
          while filters narrow the list, then sort + view at every width. */}
      <div className="mb-5 flex flex-wrap items-center gap-2 sm:gap-3">
        <FiltersButton
          activeCount={activeFilterCount}
          onClick={() => setFiltersOpen(true)}
        />
        <p
          aria-live="polite"
          className="text-sm text-muted-foreground tabular-nums"
        >
          {activeFilterCount > 0
            ? dict.wishlist.shownOf(matching.length, items.length)
            : ""}
        </p>
        <div className="ml-auto flex min-w-0 items-center gap-2 sm:gap-3">
          <SortSelect
            currentSort={sortKey}
            options={SORT_OPTIONS}
            ariaLabel={dict.wishlist.sortAria}
            onChange={({ sortBy, sortOrder }) => {
              const next = `${sortBy}:${sortOrder}`;
              if (isWishlistSortKey(next)) {
                setSortKey(next);
                resetPage();
              }
            }}
          />
          {/* At every width, like the catalogue toolbar (TASK-1958). */}
          <ViewToggle view={view} onChange={setView} />
        </div>
      </div>

      <FilterChipList chips={chips} onClearAll={clearFilters} />

      {/* eslint-disable-next-line tailwindcss/no-arbitrary-value -- fixed+fluid column layout has no named grid-cols-N equivalent */}
      <div className="grid grid-cols-1 items-start gap-7 lg:grid-cols-[268px_1fr]">
        {/* Desktop rail — the catalogue's sticky, height-capped aside: the
            device panel first, then the filter cards (§18.3). */}
        <aside
          aria-label={dict.filters.filtersButton}
          className={`hidden lg:sticky ${STICKY_ASIDE_TOP} lg:flex lg:max-h-sticky-aside lg:flex-col lg:gap-3.5 lg:self-start lg:overflow-y-auto lg:overscroll-contain`}
        >
          {rail("wl", false)}
        </aside>

        <section aria-label={dict.wishlist.heading} className="min-w-0">
          {matching.length === 0 ? (
            <ListingEmptyState
              icon={Search}
              heading={dict.wishlist.noMatchHeading}
              body={dict.wishlist.noMatchBody(items.length)}
              action={{ label: dict.filters.clear, onClick: clearFilters }}
            />
          ) : view === "list" ? (
            <div className="flex flex-col gap-3.5">
              {page.items.map((item) => (
                <WishlistListItem
                  key={item.id}
                  item={item}
                  compatibleDeviceModelIds={
                    facetsById.get(item.productId)?.compatibleDeviceModelIds
                  }
                  onRemove={removal.remove}
                />
              ))}
            </div>
          ) : (
            // The catalogue grid (TASK-415, TASK-1957) — the wishlist renders
            // the same kind of card, so it must not use a different column
            // count. `WishlistSkeleton` uses the same constant.
            <div className={PRODUCT_GRID_CLASS}>
              {page.items.map((item) => (
                <WishlistItemCard
                  key={item.id}
                  item={item}
                  compatibleDeviceModelIds={
                    facetsById.get(item.productId)?.compatibleDeviceModelIds
                  }
                  onRemove={removal.remove}
                />
              ))}
            </div>
          )}

          {page.totalPages > 1 && (
            <div className="mt-7 flex flex-col items-center gap-3">
              {page.nextCount > 0 && (
                <Button
                  type="button"
                  variant="outline"
                  size="lg"
                  onClick={() =>
                    setAppended({ key: resultKey, pages: extraPages + 1 })
                  }
                  className="min-w-60"
                >
                  {dict.catalog.loadMore(page.nextCount)}
                </Button>
              )}
              <Pagination
                currentPage={page.currentPage}
                totalPages={page.totalPages}
                buildHref={buildPageHref}
              />
            </div>
          )}
        </section>
      </div>

      {/* Mobile filters drawer — the shared one (TASK-804): the device panel,
          then the filter cards. At zero matches its footer resets the
          wishlist filters (the same action as the «no match» state behind it)
          instead of a disabled button. */}
      <FiltersDrawer
        open={filtersOpen}
        onOpenChange={setFiltersOpen}
        resultCount={matching.length}
        onReset={clearFilters}
      >
        <div className="flex flex-col gap-3.5">{rail("wl-m", true)}</div>
      </FiltersDrawer>
    </div>
  );
}
