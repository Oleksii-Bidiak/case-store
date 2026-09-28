// Server-only half of `shared/lib/schema` (TASK-819, the twin of TASK-570's
// `shared/lib/seo/server`).
//
// Every export here pages through a public listing with an Orval plain fetcher
// (`productControllerFindAll`, `categoryControllerGetCategoryTree`, …) for the
// sitemap and the merchant feed. They used to be re-exported by
// `schema/index.ts`, and through it by the `@/shared/lib` barrel — which 26
// `"use client"` modules import for `formatMoney` or `cn`. So every one of them
// carried five Orval fetchers and the axios instance in its module graph.
//
// Import these from `@/shared/lib/schema/server`; the barrels keep only the pure
// JSON-LD builders, and `shared/lib/lib-barrel.test.ts` walks their import graph
// to keep it that way.

export { fetchAllActiveProducts } from "./fetchAllProducts";
export { fetchAllPublishedPages } from "./fetchAllPages";
export { fetchAllPublishedPosts } from "./fetchAllPosts";
export {
  fetchAllActiveCategories,
  flattenActiveCategories,
} from "./fetchAllCategories";
export type { FlatCategoryRoute } from "./fetchAllCategories";
export { fetchAllCompatLandingPages } from "./fetchCompatLandingPages";
export type { CompatLandingRoute } from "./fetchCompatLandingPages";
