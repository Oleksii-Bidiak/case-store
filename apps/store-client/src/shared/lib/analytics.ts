// Vendor-agnostic analytics facade (TASK-261).
//
// A single thin wrapper over Umami's `window.umami.track` so the storefront's
// event call sites never reference the vendor directly — swapping analytics
// providers later touches only this file. Every call is a silent no-op unless
// Umami's tracker script has actually loaded and attached `window.umami`, which
// happens only when both NEXT_PUBLIC_UMAMI_SRC and NEXT_PUBLIC_UMAMI_WEBSITE_ID
// are set (see shared/config/site.ts). This is deliberately a plain module with
// no "use client" and no React import, so it is safe both in the server render
// path and in the shared/lib barrel.

declare global {
  interface Window {
    umami?: { track: (event: string, data?: Record<string, unknown>) => void };
  }
}

/** The six e-commerce events the storefront reports (handoff Block E). */
export type AnalyticsEvent =
  | "view_product"
  | "add_to_cart"
  | "begin_checkout"
  | "purchase"
  | "search"
  | "newsletter_subscribe";

/**
 * Report a storefront event to the analytics vendor.
 *
 * Fail-silent by design: `window.umami` is undefined — so this is a no-op —
 * whenever (a) the env vars are unset so the tracker `<Script>` never rendered,
 * (b) the script rendered but has not finished loading yet, or (c) an ad-blocker
 * stripped the request. Call sites therefore never need their own env/guard
 * check.
 */
export function trackEvent(
  event: AnalyticsEvent,
  data?: Record<string, string | number | boolean>,
): void {
  if (typeof window === "undefined") return;
  window.umami?.track(event, data);
}
