// Server-only half of the SEO helpers (TASK-570).
//
// Everything here performs a request: `buildHubMetadata` reads the HUB page row
// and the SEO singleton (`pages-server`, `seo-settings-server`), and the
// IndexNow submitter posts through `serverFetch` and reports to Sentry. They
// used to be re-exported by the `@/shared/lib/seo` barrel, which meant anything
// that imported the barrel for a PURE helper (`stripFormatting`,
// `buildListingMetadata`) pulled a server fetcher and the Sentry SDK into its
// module graph — harmless while every consumer was a server route, a broken
// build the day a client component needed `stripFormatting`.
//
// Import these from `@/shared/lib/seo/server`; the barrel keeps only pure code,
// and `seo-barrel.test.ts` walks its import graph to keep it that way.

// Listing-hub metadata from the admin-managed `PageKind.HUB` rows (TASK-435).
export { buildHubMetadata } from "./hub-metadata";
export type { HubMetadataInput } from "./hub-metadata";

// IndexNow submission (plan 144) — fire-and-forget instant-index ping for
// Bing/Seznam, wired into `/api/revalidate`; no-op without INDEXNOW_KEY or
// outside production.
export {
  getIndexNowKey,
  buildIndexNowPayload,
  submitToIndexNow,
} from "./indexnow";
export type { IndexNowPayload } from "./indexnow";
