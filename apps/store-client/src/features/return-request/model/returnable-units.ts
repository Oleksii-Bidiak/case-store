/** One order line, as the return form needs to see it. */
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

/** One line of the form: what was bought, what is still returnable. */
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
 * Mirrors `DEAD_RETURN_STATUSES` in the API's `ReturnService`, and for the same
 * reason: a REJECTED return means the shop said no, nothing came back, and the
 * customer may legitimately ask again with a better reason. Every other status —
 * REQUESTED, APPROVED, RECEIVED, REFUNDED — still holds its units.
 *
 * Kept in step with the server deliberately rather than derived from it: the
 * server is the authority and answers 400 either way, but a form that offers
 * quantities the server will refuse teaches customers that the shop is broken.
 */
const DEAD_RETURN_STATUSES: ReadonlySet<string> = new Set(["REJECTED"]);

/**
 * How much of each line the customer may still send back (TASK-373).
 *
 * The cap is over the SUM of live returns plus this request, never over one
 * request alone — someone who bought three may send one back today and another
 * next week, and a per-request cap would let them return the same unit
 * repeatedly. This is the client-side half of the rule `ReturnService` enforces;
 * it exists so the form can show "1 of 3 left" instead of letting the customer
 * fill in 3 and be told no.
 *
 * Lines with nothing left are returned too, with `remaining: 0`, so the form can
 * show them greyed rather than silently dropping a product the customer is
 * looking for.
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
 * Clamp a quantity a customer typed into `[0, remaining]`.
 *
 * A number input accepts pasted text, the spinner, and a `max` attribute a
 * browser is free to ignore, so the value is clamped where it is read rather
 * than where it is typed. Non-numeric input reads as 0 — an empty field means
 * "not returning this line", which is the same thing.
 */
export function clampQuantity(value: number, remaining: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(Math.max(0, Math.trunc(value)), Math.max(0, remaining));
}
