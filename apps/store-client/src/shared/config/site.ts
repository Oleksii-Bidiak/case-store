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
