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

// ─── Brand OG-image fallback (TASK-279, plan 145) ────────────────────────────
// Static branded 1200×630 card served whenever SeoSettings.defaultOgImage is
// empty (tier-3 zero-config fallback, wired in app/layout.tsx generateMetadata).
// The PNG is generated from scripts/brand-assets/og-banner.svg via
// `npm run generate:brand-assets -w apps/store-client`. The path is relative —
// layout.tsx's `metadataBase` resolves it to an absolute URL.
export const BRAND_OG_IMAGE_PATH = "/brand/og-fallback.png";
export const BRAND_OG_IMAGE_WIDTH = 1200;
export const BRAND_OG_IMAGE_HEIGHT = 630;

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

// ─── Parked-feature stubs (TASK-419) ─────────────────────────────────────────
// Three storefront controls answer every click with a "скоро" toast because the
// feature behind them does not exist yet: «Порівняти» and «Купити в 1 клік» in
// the product buy box (TASK-085 / TASK-178), and the «Порівняння» section of
// /account. For a real shopper a control that only ever apologises is worse
// than no control at all, so they are HIDDEN unless a deployment opts in.
//
// Absent variable = hidden. That is the useful default in both directions: the
// demo stand and production show only what works, and nobody has to delete the
// markup to get there — TASK-085 / TASK-178 flip this on when they land, which
// is also the moment the stubs are replaced by the real thing.
//
// Literal `process.env.X` access on purpose — that is the form Next.js inlines
// at build time for NEXT_PUBLIC_*, so flipping it means rebuilding the image.
export const FEATURE_STUBS = process.env.NEXT_PUBLIC_FEATURE_STUBS === "true";
