// Shared SEO precedence helper (plan 116, Decision 2; re-ordered by TASK-432) —
// entity meta → content-derived fallback → SeoSettings defaults. Pure,
// unit-tested; consumed by every storefront `generateMetadata()` call site + the
// root layout's title template.
export {
  resolveSeo,
  resolveTitleTemplate,
  applyTitleTemplate,
  toMetadataTitle,
  stripFormatting,
  truncateAtWord,
  SEO_TITLE_MAX,
  SEO_DESCRIPTION_MAX,
} from "./resolveSeo";
export type {
  ResolveSeoInput,
  ResolvedSeo,
  ResolveSeoSettings,
} from "./resolveSeo";

// Store display name (TASK-433) — `SeoSettings.siteName` with the `SITE_NAME`
// constant as the zero-config fallback. Every server-rendered surface that
// prints the shop's name goes through this one function.
export { resolveSiteName } from "./resolve-site-name";
export type { ResolveSiteNameSettings } from "./resolve-site-name";

// Open Graph image fallback chain (TASK-432) — a segment that declares its own
// `openGraph` block replaces the root layout's entirely, images included, so
// every such block re-states them through this one helper.
export { buildOgImages } from "./og-images";
export type { OgImage } from "./og-images";

// NOT here, on purpose (TASK-570): `buildHubMetadata` and the IndexNow
// submitter. Both perform requests (server fetchers, Sentry), and this barrel is
// imported for its pure helpers from places that must not carry either — import
// them from `@/shared/lib/seo/server`. `seo-barrel.test.ts` walks this file's
// import graph and fails if a server-only module is reachable from it again.

// Listing canonical/noindex policy (plan 143) — pure, unit-tested; consumed by
// the `/products` and `/categories/[slug]` `generateMetadata()` call sites.
export { buildListingMetadata } from "./listing-metadata";
export type {
  ListingFilterParams,
  ListingMetadataInput,
  ListingMetadataResult,
} from "./listing-metadata";
