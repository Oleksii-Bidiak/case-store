/**
 * ONE definition of "the catalogue filters" (TASK-414).
 *
 * Before this module the same question was answered in four places and four
 * different ways: `ProductFilters` decided whether to show its reset button
 * from {search, brandId, minPrice, maxPrice}; that button then cleared only
 * those four, stranding a device or spec selection the shopper could still see
 * in the chips row; `ProductListView` badged the mobile drawer from a fifth
 * set; and its `CLEARABLE_FILTERS` constant listed a sixth. None of them knew
 * about `specs`. Every new filter (here: `inStock`) multiplied that drift.
 *
 * So the list lives here once, and everything else asks.
 */

import type { ProductControllerFindAllParams } from "@/entities/product";

/**
 * Every param that NARROWS the catalogue result set, in display order.
 *
 * Deliberately excludes `sortBy`/`sortOrder`/`view`/`page`/`limit`/`isActive`:
 * those change presentation or are constants, not what is shown. Keep this in
 * step with `ListingFilterParams` in `shared/lib/seo/listing-metadata.ts`,
 * which answers the same question for the noindex rule.
 */
export const CATALOG_FILTER_KEYS = [
  "search",
  "categoryId",
  "brandId",
  "deviceModelId",
  "minPrice",
  "maxPrice",
  "specs",
  "inStock",
] as const;

export type CatalogFilterKey = (typeof CATALOG_FILTER_KEYS)[number];

export interface ActiveFilterOptions {
  /**
   * Count/clear the category alongside the rest. Defaults to `true`.
   *
   * Set `false` where the category is NOT this control's to touch: the sidebar
   * panel and the mobile drawer badge (the category's control is the chips row
   * above the grid since TASK-216), and the `/categories/[slug]` landing page
   * (the category is the route itself — «скинути всі» must not un-lock it).
   */
  includeCategory?: boolean;
}

/** Is this one filter currently narrowing the list? */
function isActive(
  params: ProductControllerFindAllParams,
  key: CatalogFilterKey,
): boolean {
  const value = params[key];
  if (value === undefined || value === null || value === "") return false;
  // `inStock` is boolean-shaped: only `true` narrows anything. `false` is a
  // no-op, not "filter to out-of-stock".
  if (key === "inStock") return value === true;
  return true;
}

/** The filters currently narrowing the list, in `CATALOG_FILTER_KEYS` order. */
export function activeFilterKeys(
  params: ProductControllerFindAllParams,
  { includeCategory = true }: ActiveFilterOptions = {},
): CatalogFilterKey[] {
  return CATALOG_FILTER_KEYS.filter(
    (key) => (includeCategory || key !== "categoryId") && isActive(params, key),
  );
}

/** How many filters are narrowing the list (the mobile drawer badge). */
export function countActiveFilters(
  params: ProductControllerFindAllParams,
  options: ActiveFilterOptions = {},
): number {
  return activeFilterKeys(params, options).length;
}

/** Is anything narrowing the list (should a reset control be offered)? */
export function hasActiveFilters(
  params: ProductControllerFindAllParams,
  options: ActiveFilterOptions = {},
): boolean {
  return activeFilterKeys(params, options).length > 0;
}

/**
 * The URL updates that clear every filter at once. Always the FULL set — never
 * only the ones currently active — so a stale param the UI does not surface
 * still gets removed.
 */
export function clearFilterUpdates({
  includeCategory = true,
}: ActiveFilterOptions = {}): Record<string, undefined> {
  const updates: Record<string, undefined> = {};
  for (const key of CATALOG_FILTER_KEYS) {
    if (!includeCategory && key === "categoryId") continue;
    updates[key] = undefined;
  }
  return updates;
}
