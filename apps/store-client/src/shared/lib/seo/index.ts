// Shared SEO precedence helper (plan 116, Decision 2) — entity meta → SeoSettings
// defaults → content-derived fallback. Pure, unit-tested; consumed by every
// storefront `generateMetadata()` call site + the root layout's title template.
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
