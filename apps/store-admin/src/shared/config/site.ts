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

// Full URL to this store's website view inside Umami's own dashboard UI (TASK-262).
// Distinct from store-client's NEXT_PUBLIC_UMAMI_SRC/WEBSITE_ID (plan 125), which load
// Umami's tracker *script* — store-admin never loads that script, it only links out to
// Umami's own UI. Left empty by default: the dashboard's "Відвідуваність" card renders in
// a muted, linkless state rather than crashing or dead-linking. e.g.
// https://analytics.mystore.ua/websites/<website-id>
export const UMAMI_DASHBOARD_URL =
  process.env.NEXT_PUBLIC_UMAMI_DASHBOARD_URL ?? "";
