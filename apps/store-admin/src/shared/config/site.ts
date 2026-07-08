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
