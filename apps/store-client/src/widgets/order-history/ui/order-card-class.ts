/**
 * The order card shell (AccountOrders.dc.html `.ao-card`), shared by the real
 * card and its skeleton so they cannot drift: 18px card radius, 16px padding
 * (20px from `sm`), 16px between the rows.
 */
export const ORDER_CARD_CLASS =
  "flex flex-col gap-4 rounded-card border border-border bg-card p-4 shadow-card sm:p-5";

/** The card list — 12px between cards. */
export const ORDER_LIST_CLASS = "flex flex-col gap-3";
