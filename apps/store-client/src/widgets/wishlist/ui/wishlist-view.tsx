"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Heart, SlidersHorizontal, X } from "lucide-react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { useGetWishlist, type WishlistItemEntity } from "@/entities/wishlist";
import { useAuth } from "@/entities/session";
import { getGetCartQueryKey, useAddToCart } from "@/entities/cart";
import { ViewToggle, type CatalogView } from "@/features/product-filters";
import {
  Button,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Sheet,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/shared/ui";
import { dict, STICKY_ASIDE_TOP } from "@/shared/config";
import { WishlistItemCard } from "./wishlist-item-card";
import { WishlistListItem } from "./wishlist-list-item";
import {
  WishlistFilters,
  EMPTY_WISHLIST_FILTERS,
  isOnSale,
  isInStock,
  type WishlistFilterState,
} from "./wishlist-filters";
import { WishlistSkeleton } from "./wishlist-skeleton";

type SortKey = "recent" | "priceAsc" | "priceDesc" | "sale";

const SORT_LABELS: Record<SortKey, string> = {
  recent: dict.wishlist.sort.recent,
  priceAsc: dict.wishlist.sort.priceAsc,
  priceDesc: dict.wishlist.sort.priceDesc,
  sale: dict.wishlist.sort.sale,
};

function sortItems(items: WishlistItemEntity[], key: SortKey) {
  return items.slice().sort((a, b) => {
    switch (key) {
      case "priceAsc":
        return Number(a.price) - Number(b.price);
      case "priceDesc":
        return Number(b.price) - Number(a.price);
      case "sale":
        return Number(isOnSale(b)) - Number(isOnSale(a));
      default:
        // "recent" — most recently added (wishlist createdAt) first.
        return b.createdAt.localeCompare(a.createdAt);
    }
  });
}

/**
 * WishlistView — the `/wishlist` page (Wishlist.dc.html redesign). Reads the
 * saved products (guest or user) via the cached useGetWishlist query, then runs
 * a real, client-side toolbar over that bounded list: grid/list view, sort,
 * quick filters (sale / in-stock), a price range, active-filter chips, and an
 * "add all to cart" bulk action. Removing an item and adding to the cart reuse
 * the real wishlist/cart mutations. Brand filtering and ratings are omitted (the
 * wishlist item summary carries neither — TASK-176).
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

  const [view, setView] = useState<CatalogView>("grid");
  const [sortKey, setSortKey] = useState<SortKey>("recent");
  const [filters, setFilters] = useState<WishlistFilterState>(
    EMPTY_WISHLIST_FILTERS,
  );
  const [filtersOpen, setFiltersOpen] = useState(false);

  // Only fully-hydrated items (a slug) render; optimistic placeholders are dropped.
  const items = useMemo(
    () => (data?.data?.items ?? []).filter((item) => Boolean(item.productSlug)),
    [data],
  );

  const { visible, activeFilterCount } = useMemo(() => {
    const min = filters.minPrice ? Number(filters.minPrice) : null;
    const max = filters.maxPrice ? Number(filters.maxPrice) : null;
    const filtered = items.filter((item) => {
      const price = Number(item.price);
      if (min != null && price < min) return false;
      if (max != null && price > max) return false;
      if (filters.saleOnly && !isOnSale(item)) return false;
      if (filters.inStockOnly && !isInStock(item)) return false;
      return true;
    });
    const count =
      (filters.saleOnly ? 1 : 0) +
      (filters.inStockOnly ? 1 : 0) +
      (min != null || max != null ? 1 : 0);
    return { visible: sortItems(filtered, sortKey), activeFilterCount: count };
  }, [items, filters, sortKey]);

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

  // Nothing saved at all — the heart empty state.
  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center gap-4 rounded-[18px] border border-border bg-card px-6 py-20 text-center">
        <span className="inline-flex size-[72px] items-center justify-center rounded-full bg-[color-mix(in_oklab,var(--color-sale)_12%,var(--color-card))] text-sale">
          <Heart className="size-9" aria-hidden="true" />
        </span>
        <h1 className="font-display text-xl font-bold text-foreground">
          {dict.wishlist.emptyHeading}
        </h1>
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
    );
  }

  const clearFilters = () => setFilters(EMPTY_WISHLIST_FILTERS);

  const chips: { key: string; label: string; remove: () => void }[] = [];
  if (filters.saleOnly) {
    chips.push({
      key: "sale",
      label: dict.wishlist.quickSale,
      remove: () => setFilters((f) => ({ ...f, saleOnly: false })),
    });
  }
  if (filters.inStockOnly) {
    chips.push({
      key: "stock",
      label: dict.wishlist.quickInStock,
      remove: () => setFilters((f) => ({ ...f, inStockOnly: false })),
    });
  }
  if (filters.minPrice || filters.maxPrice) {
    chips.push({
      key: "price",
      label: dict.wishlist.priceChip(filters.minPrice, filters.maxPrice),
      remove: () => setFilters((f) => ({ ...f, minPrice: "", maxPrice: "" })),
    });
  }

  async function addAllToCart() {
    const buyable = visible.filter(isInStock);
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

  return (
    <div>
      <nav
        aria-label={dict.product.breadcrumbAria}
        className="mb-[18px] flex items-center gap-2.5 text-[13.5px] text-muted-foreground"
      >
        <Link href="/" className="transition-colors hover:text-foreground">
          {dict.wishlist.breadcrumbHome}
        </Link>
        <span aria-hidden="true" className="opacity-50">
          ›
        </span>
        <span className="font-medium text-foreground">
          {dict.wishlist.heading}
        </span>
      </nav>

      {/* Title + toolbar */}
      <div className="mb-[18px] flex flex-wrap items-end justify-between gap-5">
        <div>
          <h1 className="font-display text-[32px] font-bold tracking-[-0.02em] text-foreground">
            {dict.wishlist.heading}
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {dict.wishlist.countInList(items.length)}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
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

          <ViewToggle
            view={view}
            onChange={setView}
            className="hidden lg:flex"
          />

          <Select
            value={sortKey}
            onValueChange={(v) => setSortKey(v as SortKey)}
          >
            <SelectTrigger
              aria-label={dict.wishlist.sortAria}
              className="h-11 gap-2.5 rounded-xl border-[1.5px] border-border bg-card px-4 font-semibold text-foreground shadow-none *:data-[slot=select-value]:text-primary hover:border-primary"
            >
              <span className="hidden font-medium text-muted-foreground sm:inline">
                {dict.filters.sortPrefix}
              </span>
              <SelectValue />
            </SelectTrigger>
            <SelectContent align="end" className="rounded-xl">
              {(Object.keys(SORT_LABELS) as SortKey[]).map((key) => (
                <SelectItem key={key} value={key}>
                  {SORT_LABELS[key]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

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

      {/* Active filter chips */}
      {chips.length > 0 && (
        <div className="mb-[22px] flex flex-wrap items-center gap-2.5">
          {chips.map((chip) => (
            <button
              key={chip.key}
              type="button"
              onClick={chip.remove}
              className="inline-flex h-[34px] items-center gap-2 rounded-full border border-primary bg-[color-mix(in_oklab,var(--color-primary)_8%,var(--color-card))] py-0 pr-2 pl-[13px] text-[13.5px] font-semibold text-primary"
            >
              {chip.label}
              <span className="inline-flex size-[18px] items-center justify-center rounded-full bg-primary text-primary-foreground">
                <X className="size-3" strokeWidth={3} />
              </span>
            </button>
          ))}
          <button
            type="button"
            onClick={clearFilters}
            className="text-[13.5px] font-semibold text-muted-foreground underline underline-offset-[3px] transition-colors hover:text-foreground"
          >
            {dict.filters.clearAll}
          </button>
        </div>
      )}

      {/* eslint-disable-next-line tailwindcss/no-arbitrary-value -- fixed+fluid column layout has no named grid-cols-N equivalent */}
      <div className="grid grid-cols-1 items-start gap-7 lg:grid-cols-[268px_1fr]">
        {/* Desktop sidebar */}
        <aside
          className={`hidden lg:sticky ${STICKY_ASIDE_TOP} lg:block lg:self-start`}
        >
          <WishlistFilters
            items={items}
            value={filters}
            onChange={setFilters}
          />
        </aside>

        <section className="min-w-0">
          {visible.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-[18px] border border-border bg-card px-5 py-14 text-center shadow-card">
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
              {visible.map((item) => (
                <WishlistListItem key={item.id} item={item} />
              ))}
            </div>
          ) : (
            <div className="grid gap-[18px] [grid-template-columns:repeat(auto-fill,minmax(232px,1fr))]">
              {visible.map((item) => (
                <WishlistItemCard key={item.id} item={item} />
              ))}
            </div>
          )}
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
            <WishlistFilters
              idPrefix="wl-m"
              items={items}
              value={filters}
              onChange={setFilters}
            />
          </div>
          <SheetFooter className="border-t border-border">
            <button
              type="button"
              onClick={() => setFiltersOpen(false)}
              disabled={visible.length === 0}
              className="h-12 w-full rounded-xl bg-primary text-[15px] font-bold text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {dict.filters.mobileApply(visible.length)}
            </button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </div>
  );
}
