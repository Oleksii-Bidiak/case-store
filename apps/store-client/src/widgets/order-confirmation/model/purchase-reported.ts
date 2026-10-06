/**
 * Has this browser already reported `purchase` for this order? (TASK-217)
 *
 * The confirmation page is also the provider's `result_url`, so every
 * «Оплатити» from the account brings the shopper back here for an order that
 * was bought long ago. The in-component ref only spans one mount; this note
 * spans the visits, so the funnel counts an order once per browser.
 *
 * localStorage, not sessionStorage: paying later usually happens in a new tab.
 * Blocked storage reads as "not reported" — a double count beats a lost one.
 */

const KEY_PREFIX = "analytics:purchase:";

function storage(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

export function wasPurchaseReported(orderId: string): boolean {
  const store = storage();
  if (!store) return false;
  try {
    return store.getItem(KEY_PREFIX + orderId) !== null;
  } catch {
    return false;
  }
}

export function markPurchaseReported(orderId: string): void {
  try {
    storage()?.setItem(KEY_PREFIX + orderId, "1");
  } catch {
    // A full or blocked quota only risks one more count.
  }
}
