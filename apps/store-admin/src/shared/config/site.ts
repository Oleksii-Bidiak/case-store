// Public storefront origin (TASK-269). Mirrors store-client's
// `shared/config/site.ts` SITE_URL fallback chain exactly (same env-var names,
// same precedence) so a single NEXT_PUBLIC_SITE_URL, if ever set, works for both
// apps. Today it falls back to the already-present NEXT_PUBLIC_APP_URL — which
// points at the storefront in every existing .env.example — then to localhost.
//
// Used by the SEO-health section to link the owner to the live /robots.txt,
// /sitemap.xml, and /llms.txt the storefront serves.
export const STOREFRONT_URL =
  process.env.NEXT_PUBLIC_SITE_URL ??
  process.env.NEXT_PUBLIC_APP_URL ??
  "http://localhost:3000";

/**
 * Host (`example.com`, `localhost:3000` — no scheme, no path) of
 * {@link STOREFRONT_URL}, for the green breadcrumb line of the SERP-snippet
 * preview shown under every metaTitle/metaDescription pair (TASK-433).
 *
 * Before TASK-433 that line was the hardcoded string `casestore.ua` in
 * `dictionary.ts` — somebody else's domain in the owner's own Google preview.
 * The store's domain is not chosen yet, so the environment is the only honest
 * source: the same `NEXT_PUBLIC_SITE_URL` the storefront already canonicalizes
 * with, which means the preview follows the real deployment for free.
 *
 * Computed HERE and not in `dictionary.ts` on purpose: the dictionary is a
 * constants module evaluated at import time, and `new URL()` on a malformed
 * env value throws — which would take the whole admin panel down instead of
 * degrading one advisory UI line. Hence the try/catch and the literal
 * fallback, which is also what a build with no env var at all renders.
 */
function resolveStorefrontHost(): string {
  try {
    return new URL(STOREFRONT_URL).host || "localhost:3000";
  } catch {
    return "localhost:3000";
  }
}

export const STOREFRONT_HOST = resolveStorefrontHost();

// Full URL to this store's website view inside Umami's own dashboard UI (TASK-262).
// Distinct from store-client's NEXT_PUBLIC_UMAMI_SRC/WEBSITE_ID (plan 125), which load
// Umami's tracker *script* — store-admin never loads that script, it only links out to
// Umami's own UI. Left empty by default: the dashboard's "Відвідуваність" card renders in
// a muted, linkless state rather than crashing or dead-linking. e.g.
// https://analytics.mystore.ua/websites/<website-id>
export const UMAMI_DASHBOARD_URL =
  process.env.NEXT_PUBLIC_UMAMI_DASHBOARD_URL ?? "";
