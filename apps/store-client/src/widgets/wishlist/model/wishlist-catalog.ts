import type { WishlistItemEntity } from "@/entities/wishlist";

/**
 * Pure model for `/wishlist` as «каталог №2» (TASK-1300).
 *
 * The owner's call: the filters are CLIENT-side, over the list the page has
 * already loaded — a wishlist is short and personal, so a round trip per tick
 * would only add latency. Everything here is a plain function of
 * (items, facets, state), which keeps the view thin and the behaviour testable
 * without rendering.
 *
 * Category, brand and compatible devices are not part of the wishlist item
 * summary; they come from the product cards endpoint and arrive here as
 * `facetsById`. An item missing from that map (a withdrawn product, or one
 * still loading) simply does not match an active category / brand / device
 * filter — it is never guessed into one.
 */

/** Category / brand / compatibility of one saved product, by `productId`. */
export interface WishlistItemFacets {
  categoryId?: string;
  brandId?: string;
  brandName?: string;
  /**
   * Device models the product fits (`compatibleDeviceModelIds` on the card).
   * Empty for a product that is not device-specific.
   */
  compatibleDeviceModelIds?: readonly string[];
}

export interface WishlistFilterState {
  /**
   * «З урахуванням моїх пристроїв» (Д3-2 Wishlist mockup): only what fits at
   * least one saved device. OFF by default — a wishlist holds things for the
   * whole family, not just for the active phone. Means nothing without a
   * saved device (see `effectiveWishlistFilters`).
   */
  devicesOnly: boolean;
  saleOnly: boolean;
  inStockOnly: boolean;
  /** Ticked categories — an item matches ANY of them. */
  categoryIds: string[];
  /** Ticked brands — an item matches ANY of them. */
  brandIds: string[];
  /** Lower price bound in ₴ (`undefined` = none). */
  minPrice?: number;
  /** Upper price bound in ₴ (`undefined` = none). */
  maxPrice?: number;
}

export const EMPTY_WISHLIST_FILTERS: WishlistFilterState = {
  devicesOnly: false,
  saleOnly: false,
  inStockOnly: false,
  categoryIds: [],
  brandIds: [],
};

/** The wishlist's own sort orders, as `${sortBy}:${sortOrder}` (SortSelect). */
export type WishlistSortKey =
  "createdAt:desc" | "price:asc" | "price:desc" | "discount:desc";

export const DEFAULT_WISHLIST_SORT: WishlistSortKey = "createdAt:desc";

/** Cards per page — three rows of four on desktop, six of two on a phone. */
export const WISHLIST_PAGE_SIZE = 12;

/** How many category / brand rows show before «Показати всі (N)». */
export const FACET_VISIBLE_COUNT = 5;

export function isOnSale(item: WishlistItemEntity): boolean {
  return (
    item.compareAtPrice != null &&
    Number(item.compareAtPrice) > Number(item.price)
  );
}

export function isInStock(item: WishlistItemEntity): boolean {
  // The API exposes the capped orderable quantity (maxQty), never the raw
  // stock figure (TASK-231); 0 means the position is out of stock.
  return item.maxQty > 0 && item.isActive;
}

/** Share of the old price taken off (0 when the item is not discounted). */
export function discountRatio(item: WishlistItemEntity): number {
  if (!isOnSale(item)) return 0;
  return 1 - Number(item.price) / Number(item.compareAtPrice);
}

export function isWishlistSortKey(value: string): value is WishlistSortKey {
  return (
    value === "createdAt:desc" ||
    value === "price:asc" ||
    value === "price:desc" ||
    value === "discount:desc"
  );
}

/**
 * The filter state as it actually applies: the device switch means nothing
 * without a saved device (the panel hides it then), so a stale `devicesOnly`
 * — the last device was forgotten in another tab — neither filters nor badges.
 */
export function effectiveWishlistFilters(
  filters: WishlistFilterState,
  deviceCount: number,
): WishlistFilterState {
  return filters.devicesOnly && deviceCount === 0
    ? { ...filters, devicesOnly: false }
    : filters;
}

/** Whether any filter narrows the list. */
export function hasActiveWishlistFilters(
  filters: WishlistFilterState,
): boolean {
  return countActiveWishlistFilters(filters) > 0;
}

/**
 * The number on the «Фільтри» badge: one per chip the row would show (each
 * ticked category and brand counts, the price range counts once).
 */
export function countActiveWishlistFilters(
  filters: WishlistFilterState,
): number {
  return (
    (filters.devicesOnly ? 1 : 0) +
    (filters.saleOnly ? 1 : 0) +
    (filters.inStockOnly ? 1 : 0) +
    filters.categoryIds.length +
    filters.brandIds.length +
    (filters.minPrice != null || filters.maxPrice != null ? 1 : 0)
  );
}

/**
 * Whether a product with these compatible models fits at least one of the
 * saved devices. A product without compatibility data (headphones, a power
 * bank) fits none — the reading the catalogue's `?device=a,b` filter gives on
 * the API side, so «only for my devices» means the same on both pages.
 */
export function fitsAnyDevice(
  compatibleDeviceModelIds: readonly string[] | undefined,
  deviceModelIds: readonly string[],
): boolean {
  if (!compatibleDeviceModelIds?.length) return false;
  return deviceModelIds.some((id) => compatibleDeviceModelIds.includes(id));
}

/**
 * Apply the filter state (AND across sections, OR within a section).
 * `deviceModelIds` are the saved devices' models, read only when
 * `devicesOnly` is on — pass the state through `effectiveWishlistFilters`
 * first, so an empty device list cannot filter everything out.
 */
export function filterWishlistItems(
  items: readonly WishlistItemEntity[],
  filters: WishlistFilterState,
  facetsById: ReadonlyMap<string, WishlistItemFacets>,
  deviceModelIds: readonly string[] = [],
): WishlistItemEntity[] {
  const categories = new Set(filters.categoryIds);
  const brands = new Set(filters.brandIds);
  return items.filter((item) => {
    const price = Number(item.price);
    if (filters.minPrice != null && price < filters.minPrice) return false;
    if (filters.maxPrice != null && price > filters.maxPrice) return false;
    if (filters.saleOnly && !isOnSale(item)) return false;
    if (filters.inStockOnly && !isInStock(item)) return false;
    const facets = facetsById.get(item.productId);
    if (
      filters.devicesOnly &&
      !fitsAnyDevice(facets?.compatibleDeviceModelIds, deviceModelIds)
    ) {
      return false;
    }
    if (categories.size > 0) {
      if (!facets?.categoryId || !categories.has(facets.categoryId)) {
        return false;
      }
    }
    if (brands.size > 0) {
      if (!facets?.brandId || !brands.has(facets.brandId)) return false;
    }
    return true;
  });
}

/** Sort a copy of the list; ties keep the most recently saved first. */
export function sortWishlistItems(
  items: readonly WishlistItemEntity[],
  sort: WishlistSortKey,
): WishlistItemEntity[] {
  const recentFirst = (a: WishlistItemEntity, b: WishlistItemEntity) =>
    b.createdAt.localeCompare(a.createdAt);
  return items.slice().sort((a, b) => {
    switch (sort) {
      case "price:asc":
        return Number(a.price) - Number(b.price) || recentFirst(a, b);
      case "price:desc":
        return Number(b.price) - Number(a.price) || recentFirst(a, b);
      case "discount:desc":
        return discountRatio(b) - discountRatio(a) || recentFirst(a, b);
      default:
        return recentFirst(a, b);
    }
  });
}

/**
 * Put restored items back where they were (Д3-2 «Повернути»). Undo re-adds
 * the product and the server stamps it with a NEW `createdAt`, so under
 * «нещодавно додані» it would jump to the top. `restoredAt` maps a product id
 * to the date it was first saved; the list reads that date instead for as
 * long as the page is open. Returns the input untouched when nothing applies.
 */
export function withRestoredDates(
  items: readonly WishlistItemEntity[],
  restoredAt: ReadonlyMap<string, string>,
): readonly WishlistItemEntity[] {
  if (restoredAt.size === 0) return items;
  return items.map((item) => {
    const original = restoredAt.get(item.productId);
    return original && original !== item.createdAt
      ? { ...item, createdAt: original }
      : item;
  });
}

/** One checkbox row of the category / brand sections. */
export interface FacetOption {
  id: string;
  label: string;
  /** Saved items carrying this value (over the whole list, not the filtered one). */
  count: number;
}

/**
 * The values of one facet present in the list, most frequent first (then by
 * name). `resolve` maps an item's facets to `{ id, label }`, or `undefined` when
 * the item has no such value or its label is unknown (the row would read «»).
 */
export function collectFacetOptions(
  items: readonly WishlistItemEntity[],
  facetsById: ReadonlyMap<string, WishlistItemFacets>,
  resolve: (
    facets: WishlistItemFacets,
  ) => { id: string; label: string } | undefined,
): FacetOption[] {
  const byId = new Map<string, FacetOption>();
  for (const item of items) {
    const facets = facetsById.get(item.productId);
    const value = facets ? resolve(facets) : undefined;
    if (!value) continue;
    const existing = byId.get(value.id);
    if (existing) existing.count += 1;
    else byId.set(value.id, { ...value, count: 1 });
  }
  return [...byId.values()].sort(
    (a, b) => b.count - a.count || a.label.localeCompare(b.label, "uk"),
  );
}

/**
 * Upper edge of the price slider: the priciest saved item rounded up to the
 * next thousand (never below 1 000 ₴), so the thumbs span the prices that are
 * actually in the list instead of the catalogue's 100 000 ₴.
 */
export function wishlistPriceDomain(
  items: readonly WishlistItemEntity[],
): number {
  const max = items.reduce((m, item) => Math.max(m, Number(item.price)), 0);
  return Math.max(1000, Math.ceil(max / 1000) * 1000);
}

/** `?page=` → a page number ≥ 1 (anything else reads as the first page). */
export function parsePageParam(raw: string | null): number {
  const page = Number(raw);
  return Number.isInteger(page) && page > 1 ? page : 1;
}

export interface WishlistPage {
  /** The page the URL asks for, clamped into `[1, totalPages]`. */
  currentPage: number;
  totalPages: number;
  /** Items to render: the base page plus every appended («Показати ще») page. */
  items: WishlistItemEntity[];
  /** How many the next «Показати ще» adds (0 = nothing left after the shown pages). */
  nextCount: number;
}

/**
 * Slice the sorted, filtered list for display. The URL's page anchors the
 * first rendered page; `extraPages` appended pages follow it, the same model as
 * the catalogue's load-more (TASK-216).
 */
export function paginateWishlist(
  items: readonly WishlistItemEntity[],
  requestedPage: number,
  extraPages: number,
  pageSize: number = WISHLIST_PAGE_SIZE,
): WishlistPage {
  const totalPages = Math.max(1, Math.ceil(items.length / pageSize));
  const currentPage = Math.min(Math.max(1, requestedPage), totalPages);
  const lastPage = Math.min(totalPages, currentPage + extraPages);
  const start = (currentPage - 1) * pageSize;
  const end = lastPage * pageSize;
  const remaining = items.length - end;
  return {
    currentPage,
    totalPages,
    items: items.slice(start, end),
    nextCount: Math.max(0, Math.min(pageSize, remaining)),
  };
}
