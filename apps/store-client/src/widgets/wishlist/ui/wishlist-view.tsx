"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Heart, SlidersHorizontal } from "lucide-react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { useGetWishlist } from "@/entities/wishlist";
import { useAuth } from "@/entities/session";
import { getGetCartQueryKey, useAddToCart } from "@/entities/cart";
import {
  FilterChipList,
  FiltersDrawer,
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
import {
  DEFAULT_WISHLIST_SORT,
  EMPTY_WISHLIST_FILTERS,
  collectFacetOptions,
  countActiveWishlistFilters,
  filterWishlistItems,
  isInStock,
  isWishlistSortKey,
  paginateWishlist,
  parsePageParam,
  sortWishlistItems,
  wishlistPriceDomain,
  type WishlistFilterState,
  type WishlistSortKey,
} from "../model/wishlist-catalog";
import { useWishlistFacets } from "../model/use-wishlist-facets";
import { WishlistItemCard } from "./wishlist-item-card";
import { WishlistListItem } from "./wishlist-list-item";
import { WishlistFilters } from "./wishlist-filters";
import { WishlistSkeleton } from "./wishlist-skeleton";

const SORT_OPTIONS: readonly SortOption[] = [
  { value: "createdAt:desc", label: dict.wishlist.sort.recent },
  { value: "price:asc", label: dict.wishlist.sort.priceAsc },
  { value: "price:desc", label: dict.wishlist.sort.priceDesc },
  { value: "discount:desc", label: dict.wishlist.sort.sale },
];

/**
 * WishlistView — `/wishlist` as «каталог №2» (TASK-1300, Wishlist.dc.html
 * «ЦІЛЬ · TASK-1300»). Reads the saved products (guest or user) via the cached
 * useGetWishlist query and runs the catalogue's toolbar over that list,
 * client-side (owner's call): grid/list view, sort, the rail (quick filters,
 * category, brand, a working two-thumb price slider), active-filter chips,
 * «Показати ще» + numbered pages, and the «add all to cart» bulk action.
 *
 * State: filters, sort and view are component state — they are a lens on a
 * personal list, not a shareable listing. The PAGE is the URL (`?page=`), so
 * the shared link-based `Pagination` works and Back returns to the page the
 * shopper was on; any filter or sort change drops it back to the first page.
 * «Показати ще» appends the following pages in place, keyed by the result set
 * through a render-time guard (docs/conventions/forms.md), like the catalogue.
 */
export function WishlistView() {
  // Hold the query until auth bootstrap settles so the page never flashes a
  // transient empty guest wishlist minted during refresh (TASK-118 pattern).
  const { isInitializing } = useAuth();
  const { data, isPending, isError } = useGetWishlist({
    query: { enabled: !isInitializing },
  });
  const queryClient = useQueryClient();
  const addToCart = useAddToCart();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const requestedPage = parsePageParam(searchParams.get("page"));

  const [view, setView] = useState<CatalogView>("grid");
  const [sortKey, setSortKey] = useState<WishlistSortKey>(
    DEFAULT_WISHLIST_SORT,
  );
  const [filters, setFilters] = useState<WishlistFilterState>(
    EMPTY_WISHLIST_FILTERS,
  );
  const [filtersOpen, setFiltersOpen] = useState(false);

  // Only fully-hydrated items (a slug) render; optimistic placeholders are dropped.
  const items = useMemo(
    () => (data?.data?.items ?? []).filter((item) => Boolean(item.productSlug)),
    [data],
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

  const matching = useMemo(
    () =>
      sortWishlistItems(
        filterWishlistItems(items, filters, facetsById),
        sortKey,
      ),
    [items, filters, facetsById, sortKey],
  );
  const activeFilterCount = countActiveWishlistFilters(filters);

  // «Показати ще» appends pages to the URL's page. The appended count belongs
  // to one result set; a mismatched key (filters, sort or page changed) reads
  // as zero — a render-time guard, not an effect. The list's length is left
  // out on purpose: removing one card must not collapse the appended pages
  // (`paginateWishlist` clamps if the list shrinks below them).
  const resultKey = JSON.stringify([filters, sortKey, requestedPage]);
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
      <Link href="/" className="transition-colors hover:text-foreground">
        {dict.wishlist.breadcrumbHome}
      </Link>
      <span aria-hidden="true" className="opacity-50">
        ›
      </span>
      <span aria-current="page" className="font-medium text-foreground">
        {dict.wishlist.heading}
      </span>
    </nav>
  );

  // Nothing saved at all — the heart empty state. The page keeps its trail and
  // its h1 «Обране» (owner 7.11, TASK-875); the card's line is a sub-heading,
  // so the empty page no longer swaps its title for a sentence.
  if (items.length === 0) {
    return (
      <div>
        {breadcrumb}
        <h1 className={`${H1_CLASS} mb-4.5 text-foreground`}>
          {dict.wishlist.heading}
        </h1>
        <div className="flex flex-col items-center gap-4 rounded-card border border-border bg-card px-6 py-20 text-center">
          <span className="inline-flex size-[72px] items-center justify-center rounded-full bg-sale/12 text-sale">
            <Heart className="size-9" aria-hidden="true" />
          </span>
          <h2 className="font-display text-xl font-bold text-foreground">
            {dict.wishlist.emptyHeading}
          </h2>
          <p className="max-w-sm text-sm text-muted-foreground">
            {dict.wishlist.emptyBody}
          </p>
          <Link
            href="/products"
            className="inline-flex items-center rounded-xl bg-primary px-6 py-2.5 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {dict.wishlist.emptyCta}
          </Link>
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

  const clearFilters = () => updateFilters(EMPTY_WISHLIST_FILTERS);

  const chips: FilterChip[] = [];
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

  async function addAllToCart() {
    // Every in-stock item the filters leave, not just the page on screen.
    const buyable = matching.filter(isInStock);
    if (buyable.length === 0) {
      toast(dict.wishlist.addAllNone);
      return;
    }
    try {
      await Promise.all(
        buyable.map((item) =>
          addToCart.mutateAsync({
            data: { productId: item.productId, quantity: 1 },
          }),
        ),
      );
      queryClient.invalidateQueries({ queryKey: getGetCartQueryKey() });
      toast.success(dict.wishlist.addAllDone);
    } catch {
      toast.error(dict.addToCart.error);
    }
  }

  const buildPageHref = (target: number) =>
    target > 1 ? `${pathname}?page=${target}` : pathname;

  const rail = (
    collapsible: boolean,
    idPrefix: string | undefined = undefined,
  ) => (
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
  );

  return (
    <div>
      {breadcrumb}

      {/* Title + toolbar */}
      <div className="mb-4.5 flex flex-wrap items-end justify-between gap-5">
        <div>
          <h1 className={`${H1_CLASS} text-foreground`}>
            {dict.wishlist.heading}
          </h1>
          <p aria-live="polite" className="mt-2 text-sm text-muted-foreground">
            {activeFilterCount > 0
              ? dict.wishlist.foundOf(matching.length, items.length)
              : dict.wishlist.countInList(items.length)}
          </p>
        </div>

        <div className="flex min-w-0 flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => setFiltersOpen(true)}
            className="inline-flex h-11 shrink-0 items-center gap-2 rounded-xl border-[1.5px] border-border bg-card px-4 text-sm font-semibold text-foreground outline-none transition-colors hover:border-primary focus-visible:ring-2 focus-visible:ring-ring lg:hidden"
          >
            <SlidersHorizontal className="size-4.5" />
            {dict.filters.filtersButton}
            {activeFilterCount > 0 && (
              <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-xs font-bold text-primary-foreground">
                {activeFilterCount}
              </span>
            )}
          </button>

          <ViewToggle
            view={view}
            onChange={setView}
            className="hidden lg:flex"
          />

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

          <Button
            type="button"
            variant="outline"
            onClick={() => void addAllToCart()}
            disabled={addToCart.isPending}
            className="h-11 rounded-xl"
          >
            {dict.wishlist.addAll}
          </Button>
        </div>
      </div>

      <FilterChipList chips={chips} onClearAll={clearFilters} />

      {/* eslint-disable-next-line tailwindcss/no-arbitrary-value -- fixed+fluid column layout has no named grid-cols-N equivalent */}
      <div className="grid grid-cols-1 items-start gap-7 lg:grid-cols-[268px_1fr]">
        {/* Desktop sidebar */}
        <aside
          className={`hidden lg:sticky ${STICKY_ASIDE_TOP} lg:block lg:self-start`}
        >
          {rail(false)}
        </aside>

        <section className="min-w-0">
          {matching.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-card border border-border bg-card px-5 py-14 text-center shadow-card">
              <b className="font-display text-xl font-bold text-foreground">
                {dict.wishlist.noMatchHeading}
              </b>
              <p className="mt-2 mb-4 max-w-sm text-sm text-muted-foreground">
                {dict.wishlist.noMatchBody}
              </p>
              <Button type="button" variant="outline" onClick={clearFilters}>
                {dict.filters.clear}
              </Button>
            </div>
          ) : view === "list" ? (
            <div className="flex flex-col gap-3.5">
              {page.items.map((item) => (
                <WishlistListItem key={item.id} item={item} />
              ))}
            </div>
          ) : (
            // Same 1 / 2 / 4 grid as the catalog (TASK-415) — the wishlist
            // renders the same kind of card, so it must not use a different
            // column count. Byte-identical to `WishlistSkeleton`.
            <div className="grid grid-cols-1 items-stretch gap-4 md:gap-6 min-[390px]:grid-cols-2 lg:grid-cols-4">
              {page.items.map((item) => (
                <WishlistItemCard key={item.id} item={item} />
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

      {/* Mobile filters drawer — the shared one (TASK-804). At zero matches
          its footer resets the wishlist filters (the same action as the
          «no match» state behind it) instead of a disabled button. */}
      <FiltersDrawer
        open={filtersOpen}
        onOpenChange={setFiltersOpen}
        resultCount={matching.length}
        onReset={clearFilters}
      >
        {rail(true, "wl-m")}
      </FiltersDrawer>
    </div>
  );
}
