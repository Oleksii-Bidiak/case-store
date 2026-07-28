/**
 * A note-to-self that this browser was just sent off to pay for an order.
 *
 * ── What this is NOT ──────────────────────────────────────────────────────────
 * It is **not** evidence of payment, and nothing here may ever be treated as
 * such. It lives in `sessionStorage`, so anyone can write anything into it. The
 * only thing it decides is *wording*: whether the confirmation page says "we are
 * confirming your payment" or stays quiet. Every statement about money on that
 * page comes from the server's `paymentStatus` and nowhere else
 * (docs/payments-liqpay.md §4, rule 1).
 *
 * ── Why it is needed ──────────────────────────────────────────────────────────
 * The provider's `result_url` lands on `/orders/[id]/confirmation` with no marker
 * of where the shopper came from, and `OrderEntity` does not expose
 * `paymentMethod`. So the page cannot otherwise tell "just placed a cash-on-
 * delivery order, PENDING forever and correctly so" apart from "paid a card two
 * seconds ago, PENDING only until the callback lands". Telling a cash-on-delivery
 * shopper that we are confirming their payment would be its own small lie.
 *
 * Session-scoped on purpose: the state is about *this* trip to the provider, and
 * it should not outlive the tab.
 */

const KEY_PREFIX = "checkout:payment-attempt:";

/**
 * How long an attempt stays interesting. Comfortably longer than a card payment
 * takes (including 3-D Secure), comfortably shorter than the order's reservation
 * window, so a stale note cannot keep the page spinning.
 */
export const PAYMENT_ATTEMPT_TTL_MS = 30 * 60 * 1000;

export interface PaymentAttempt {
  /** The `Payment` row this browser was handed off for. */
  paymentId: string;
  /** When the handoff happened (epoch ms). */
  startedAt: number;
}

function storage(): Storage | null {
  try {
    // Absent during SSR; throws in some privacy modes rather than returning null.
    return typeof window === "undefined" ? null : window.sessionStorage;
  } catch {
    return null;
  }
}

/** Record that we are handing this browser off to pay for `orderId`. */
export function rememberPaymentAttempt(
  orderId: string,
  paymentId: string,
  now: number = Date.now(),
): void {
  const store = storage();
  if (!store) return;
  const attempt: PaymentAttempt = { paymentId, startedAt: now };
  try {
    store.setItem(KEY_PREFIX + orderId, JSON.stringify(attempt));
  } catch {
    // A full or blocked quota costs us nothing but slightly vaguer copy.
  }
}

/**
 * Read back a *fresh* attempt for this order, if any. Anything malformed,
 * foreign or expired reads as "no attempt" — the quiet, non-committal branch.
 */
export function readPaymentAttempt(
  orderId: string,
  now: number = Date.now(),
): PaymentAttempt | null {
  const store = storage();
  if (!store) return null;

  let raw: string | null = null;
  try {
    raw = store.getItem(KEY_PREFIX + orderId);
  } catch {
    return null;
  }
  if (!raw) return null;

  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) return null;

    const { paymentId, startedAt } = parsed as Partial<PaymentAttempt>;
    if (typeof paymentId !== "string" || typeof startedAt !== "number") {
      return null;
    }
    if (now - startedAt > PAYMENT_ATTEMPT_TTL_MS) return null;

    return { paymentId, startedAt };
  } catch {
    return null;
  }
}

/** Drop the note — the order's payment has reached a settled state. */
export function forgetPaymentAttempt(orderId: string): void {
  const store = storage();
  if (!store) return;
  try {
    store.removeItem(KEY_PREFIX + orderId);
  } catch {
    // Nothing to do; a leftover key expires on its own.
  }
}
