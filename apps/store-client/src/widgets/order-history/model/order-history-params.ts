import type { GetOrdersStatusItem, OrderItemEntity } from "@/entities/order";

/**
 * Pure model of `/account/orders` (TASK-217): the status tabs, the URL that
 * carries them, and the card arithmetic. Everything here is a plain function,
 * so the view stays thin and the rules are tested without rendering.
 */

/** The tabs, in display order. `all` is the default and has no `?status=`. */
export const ORDER_TABS = ["all", "active", "delivered", "cancelled"] as const;
export type OrderTab = (typeof ORDER_TABS)[number];

/**
 * The statuses each tab asks the API for (`GET /api/orders?status=…&status=…`,
 * TASK-217 step 1). `all` sends no filter. `REFUNDED` sits with the cancelled
 * ones: the order is over and the money went back — nothing is on its way.
 */
export const ORDER_TAB_STATUSES: Readonly<
  Record<OrderTab, readonly GetOrdersStatusItem[] | undefined>
> = {
  all: undefined,
  active: ["PENDING", "CONFIRMED", "PROCESSING", "SHIPPED"],
  delivered: ["DELIVERED"],
  cancelled: ["CANCELLED", "REFUNDED"],
};

/** Cards per page — the API's own default page size. */
export const ORDERS_PAGE_SIZE = 10;

/** `?status=` → tab. Absent, unknown or hand-edited values are «Усі». */
export function parseOrderTab(raw: string | null | undefined): OrderTab {
  return ORDER_TABS.find((tab) => tab === raw) ?? "all";
}

/** `?page=` → a page ≥ 1. Anything that is not a whole number above 1 is 1. */
export function parseOrdersPage(raw: string | null | undefined): number {
  const page = Number(raw);
  return Number.isInteger(page) && page > 1 ? page : 1;
}

/**
 * The list URL for a tab and page, keeping every other parameter (the
 * one-shot `?claimed=` banner, say). Page 1 and the «Усі» tab are the
 * defaults, so they are left out: one canonical URL per view.
 */
export function ordersHref(
  pathname: string,
  current: URLSearchParams | { toString(): string },
  next: { tab: OrderTab; page: number },
): string {
  const params = new URLSearchParams(current.toString());
  params.delete("status");
  params.delete("page");
  if (next.tab !== "all") params.set("status", next.tab);
  if (next.page > 1) params.set("page", String(next.page));
  const query = params.toString();
  return query ? `${pathname}?${query}` : pathname;
}

/**
 * Units on an order — Σ quantity, so «2 × кабель» counts two. The mockup's
 * detail (4 lines, one of them ×2 → «5 товарів») reads it this way, and so does
 * the cart badge; the thumbnails, one per line, are a different count.
 */
export function orderUnitCount(
  items: readonly Pick<OrderItemEntity, "quantity">[],
): number {
  return items.reduce((sum, item) => sum + item.quantity, 0);
}

/** Thumbnails a card shows from `sm` up, and below it (a 390px card fits 3). */
export const THUMBS_WIDE = 4;
export const THUMBS_NARROW = 3;

export interface ThumbStrip<T> {
  /** Lines with a thumbnail from `sm` up; the last one is hidden below `sm` when `narrowHidesLast`. */
  shown: T[];
  /** Whether the 4th thumbnail hides below `sm`. */
  narrowHidesLast: boolean;
  /** «+N» from `sm` up (0 = no tile). */
  moreWide: number;
  /** «+N» below `sm` (0 = no tile). */
  moreNarrow: number;
}

/**
 * The card's thumbnail strip: up to four pictures + «+N» from `sm`, up to
 * three + «+N» below it. «+N» is always "lines NOT pictured" on that width —
 * the mockup computed it from four everywhere, so a 390px card with five
 * lines showed three pictures and «+1».
 */
export function thumbStrip<T>(items: readonly T[]): ThumbStrip<T> {
  const shown = items.slice(0, THUMBS_WIDE);
  return {
    shown,
    narrowHidesLast: shown.length > THUMBS_NARROW,
    moreWide: Math.max(0, items.length - THUMBS_WIDE),
    moreNarrow: Math.max(0, items.length - THUMBS_NARROW),
  };
}
