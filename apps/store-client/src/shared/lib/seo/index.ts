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

// Listing-hub metadata from the admin-managed `PageKind.HUB` rows (TASK-435) —
// the six section landing pages get their title/description from the panel, with
// this route's dictionary strings as the fallback.
export { buildHubMetadata } from "./hub-metadata";
export type { HubMetadataInput } from "./hub-metadata";

// Listing canonical/noindex policy (plan 143) — pure, unit-tested; consumed by
// the `/products` and `/categories/[slug]` `generateMetadata()` call sites.
export { buildListingMetadata } from "./listing-metadata";
export type {
  ListingFilterParams,
  ListingMetadataInput,
  ListingMetadataResult,
} from "./listing-metadata";

// IndexNow submission (plan 144) — fire-and-forget instant-index ping for
// Bing/Seznam, wired into `/api/revalidate`; no-op without INDEXNOW_KEY or
// outside production.
export {
  getIndexNowKey,
  buildIndexNowPayload,
  submitToIndexNow,
} from "./indexnow";
export type { IndexNowPayload } from "./indexnow";
