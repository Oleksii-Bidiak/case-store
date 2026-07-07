// Site-wide configuration constants for SEO, canonical URLs, and structured data.
//
// SITE_URL is the canonical public origin used by sitemap.xml, robots.txt,
// canonical <link>s, Open Graph URLs, and Schema.org url/@id values. Set
// NEXT_PUBLIC_SITE_URL in production (e.g. https://mobilestore.com). It falls
// back to the pre-existing NEXT_PUBLIC_APP_URL, then to localhost for local dev.
//
// IMPORTANT: in production NEXT_PUBLIC_SITE_URL MUST be set, otherwise every
// canonical/sitemap URL points at localhost and search engines index nothing.
export const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL ??
  process.env.NEXT_PUBLIC_APP_URL ??
  "http://localhost:3000";

// ISO 4217 currency code emitted as Schema.org offers.priceCurrency. Defaults to
// UAH (Ukrainian hryvnia) — the storefront's market. The customer-facing UI
// always renders prices in UAH via shared/lib formatMoney; this constant only
// feeds structured data. Override with NEXT_PUBLIC_CURRENCY for another market.
export const CURRENCY = process.env.NEXT_PUBLIC_CURRENCY ?? "UAH";

// Human-readable brand / site name used in <title> templates and structured data.
export const SITE_NAME = "MobileStore";

// ─── Umami self-hosted analytics (TASK-261) ──────────────────────────────────
// Both must be set together for tracking to activate:
//   NEXT_PUBLIC_UMAMI_SRC        — full URL of Umami's tracker script
//                                  (e.g. https://analytics.mystore.ua/script.js)
//   NEXT_PUBLIC_UMAMI_WEBSITE_ID — the site id (UUID) from the Umami dashboard
// Left empty in local dev, so the <Script> tag never renders and the analytics
// facade (shared/lib/analytics) degrades to a silent no-op. Mirrors the existing
// SITE_URL/CURRENCY env-with-fallback pattern above; Next.js inlines these
// NEXT_PUBLIC_* reads at build time, so next.config.ts needs no `env` entry.
export const UMAMI_SRC = process.env.NEXT_PUBLIC_UMAMI_SRC ?? "";
export const UMAMI_WEBSITE_ID = process.env.NEXT_PUBLIC_UMAMI_WEBSITE_ID ?? "";

// True only when both keys are present. Gates the <Script> render (an empty
// `src` is invalid); the trackEvent() call sites don't re-check it — they rely
// on the facade's `window.umami?.` guard instead.
export const UMAMI_ENABLED = Boolean(UMAMI_SRC && UMAMI_WEBSITE_ID);
