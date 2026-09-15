/**
 * The active-filter params a facet request carries (TASK-489).
 *
 * `GET /categories/:id/filterable-specs` publishes «Силікон (12)», and the 12 is
 * counted over the slice the listing would currently return — so the facet call
 * has to be told what the listing is filtered by. This is the one place that
 * mapping is written.
 *
 * It exists for a second, less obvious reason: THREE components ask for the same
 * facet list on a catalogue page — the sidebar (`SpecFacets`), the mobile
 * drawer's presence gate (`ProductFilters`) and the chips row
 * (`ActiveFilterChips`, which only wants the labels). React Query dedupes them
 * into one request only while their keys are identical, and the key now includes
 * these params. Building the object here, from the same `currentParams` every
 * one of them already holds, is what keeps that one request one request.
 */

import type { CategoryControllerGetFilterableSpecsParams } from "@/entities/category";
import type { ProductControllerFindAllParams } from "@/entities/product";

/**
 * Narrow the listing params to the ones that move products in or out of the
 * slice. `page`, `limit`, `sortBy`, `sortOrder` and `view` are deliberately
 * dropped: they reorder or paginate the very same set, so including them would
 * mint a fresh facet request (and a fresh set of identical counts) on every
 * page-flip and every sort change.
 *
 * The category is NOT here either — it is the endpoint's path param.
 */
export function toFacetQueryParams(
  params: ProductControllerFindAllParams,
): CategoryControllerGetFilterableSpecsParams {
  return {
    brand: params.brand,
    device: params.device,
    minPrice: params.minPrice,
    maxPrice: params.maxPrice,
    search: params.search,
    specs: params.specs,
    inStock: params.inStock,
    onSale: params.onSale,
  };
}
