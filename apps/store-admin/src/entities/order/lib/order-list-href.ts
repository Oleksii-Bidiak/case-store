/**
 * The way back from an order card to the list it was opened from (TASK-1977).
 *
 * The order list keeps all of its state in the URL (status tab, filters, page,
 * search, page size, sort), so a row link carries that query along as ONE
 * `from` parameter and «← Замовлення» rebuilds the list URL from it. Unlike the
 * referrer (`document.referrer` does not change on a client-side navigation),
 * it survives «open in a new tab» and a reload of the card.
 *
 * `from` is only ever read as a QUERY of the fixed `/orders` path — it is
 * parsed and re-serialised, never used as a URL — so whatever arrives in it,
 * the result stays on `/orders` of this origin: no open redirect.
 */
export const ORDER_LIST_PATH = "/orders";
const FROM_PARAM = "from";

/** `/orders/:id`, with the list's current query when there is one. */
export function orderCardHref(
  orderId: string,
  listSearch?: URLSearchParams | string | null,
): string {
  const path = `${ORDER_LIST_PATH}/${orderId}`;
  const search = listSearch?.toString().replace(/^\?/, "") ?? "";
  if (!search) return path;
  return `${path}?${new URLSearchParams({ [FROM_PARAM]: search }).toString()}`;
}

/**
 * The list URL to go back to: `/orders` plus the query carried in `from`, or
 * the plain list when there is none (direct link, dashboard, search result).
 * Accepts what Next hands a page — a string, a repeated param or nothing.
 */
export function orderListHref(
  from: string | string[] | null | undefined,
): string {
  const raw = Array.isArray(from) ? from[0] : from;
  if (!raw) return ORDER_LIST_PATH;
  const params = new URLSearchParams(raw.replace(/^\?/, ""));
  // A nested `from` would only grow with every round trip.
  params.delete(FROM_PARAM);
  const search = params.toString();
  return search ? `${ORDER_LIST_PATH}?${search}` : ORDER_LIST_PATH;
}
