/** One order line, as the return dialog needs to see it. */
export interface OrderLine {
  id: string;
  productName: string;
  quantity: number;
}

/** A return already opened against the order, as the API returns it. */
export interface ExistingReturn {
  status: string;
  items: ReadonlyArray<{ orderItemId: string; quantity: number }>;
}

/** One line of the dialog: what was bought, what is still returnable. */
export interface ReturnableLine {
  orderItemId: string;
  productName: string;
  ordered: number;
  /** Ordered minus everything still claimed by a live return. Never negative. */
  remaining: number;
}

/**
 * Return statuses that no longer hold a claim on the units they name.
 *
 * Mirrors `DEAD_RETURN_STATUSES` in the API's `ReturnService` (and the
 * storefront's copy of this function): a REJECTED return means the shop said
 * no, nothing came back, and the request may be filed again. Every other
 * status — REQUESTED, APPROVED, RECEIVED, REFUNDED — still holds its units.
 */
const DEAD_RETURN_STATUSES: ReadonlySet<string> = new Set(["REJECTED"]);

/**
 * How much of each line may still be returned (TASK-1963, ported from the
 * storefront's TASK-373 logic).
 *
 * The cap is over the SUM of live returns, never over one request — otherwise
 * the same unit could be returned again and again. The server enforces the same
 * rule under a row lock and answers 400 `RETURN_QUANTITY_EXCEEDED`; this exists
 * so the operator sees «1 з 3» instead of typing 3 and being refused.
 *
 * Exhausted lines stay in the list with `remaining: 0`, so the dialog can show
 * them disabled rather than hide a product the buyer is asking about.
 */
export function returnableLines(
  items: readonly OrderLine[],
  existingReturns: readonly ExistingReturn[] = [],
): ReturnableLine[] {
  const claimed = new Map<string, number>();

  for (const row of existingReturns) {
    if (DEAD_RETURN_STATUSES.has(row.status)) continue;
    for (const item of row.items) {
      claimed.set(
        item.orderItemId,
        (claimed.get(item.orderItemId) ?? 0) + item.quantity,
      );
    }
  }

  return items.map((item) => ({
    orderItemId: item.id,
    productName: item.productName,
    ordered: item.quantity,
    remaining: Math.max(0, item.quantity - (claimed.get(item.id) ?? 0)),
  }));
}

/**
 * Clamp a typed quantity into `[0, remaining]`.
 *
 * A number input accepts pasted text and a `max` the browser may ignore, so the
 * value is clamped where it is read. Non-numeric input reads as 0 — "not
 * returning this line".
 */
export function clampQuantity(value: number, remaining: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(Math.max(0, Math.trunc(value)), Math.max(0, remaining));
}
