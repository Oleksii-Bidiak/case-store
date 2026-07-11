/**
 * Listing canonical/noindex policy (plan 143, Decisions 1–4). One pure rule for
 * every catalog listing route (`/products`, `/categories/[slug]`):
 *
 * 1. Sort params (`sortBy`/`sortOrder`) never affect canonical or robots — the
 *    helper has no parameter for them at all; callers must not pass them.
 * 2. Any present filter param → `robots: { index: false, follow: true }` and NO
 *    canonical (noindex and canonical are mutually exclusive signals — house
 *    convention, same shape as `/search` and the `noindexSite` kill switch).
 * 3. Canonical target: `categoryCanonicalPath` when set and no filter is present
 *    (the `/products?categoryId=` → `/categories/[slug]` redirect), else
 *    `basePath`. Page > 1 appends `?page=N`; page ≤ 1 / invalid is omitted.
 * 4. Filter values are trusted, caller-normalized strings with two safety nets:
 *    `""` counts as absent, and `onSale` counts only when literally `"true"`.
 *
 * `ListingFilterParams` is a closed, explicit list on purpose: a new filter
 * param added to the API contract must be consciously added here (and at both
 * page call sites) or it visibly escapes the noindex rule at review time.
 *
 * Returns a **relative** `canonicalPath` — SITE_URL is a call-site concern,
 * mirroring `resolveSeo()`.
 */

export interface ListingFilterParams {
  search?: string;
  minPrice?: string;
  maxPrice?: string;
  specs?: string;
  brandId?: string;
  deviceModelId?: string;
  /** Wire-level string; only "true" counts as a present filter (Decision 4). */
  onSale?: string;
}

export interface ListingMetadataInput {
  /** Origin-relative path with no query string — this view's "home" when unfiltered. */
  basePath: string;
  /** Parsed 1-based page number; undefined/NaN/<=1 means "first page" (omitted from canonical). */
  page?: number;
  /** Any filter param present narrows the result set and forces noindex,follow (Decision 2). */
  filters?: ListingFilterParams;
  /**
   * `/products` only — when set AND no `filters` entry is present, the canonical
   * target becomes this path instead of `basePath` (Decision 3). Omit entirely on
   * `/categories/[slug]`, which is already category-scoped by its own segment.
   */
  categoryCanonicalPath?: string;
}

export interface ListingMetadataResult {
  /** Origin-relative canonical path (incl. "?page=N" when page > 1). Absent when noindexed. */
  canonicalPath?: string;
  /** Present only when the view is noindexed; absent (→ default index,follow) otherwise. */
  robots?: { index: boolean; follow: boolean };
}

export function buildListingMetadata(
  input: ListingMetadataInput,
): ListingMetadataResult {
  const filters = input.filters ?? {};
  const hasFilter =
    (filters.search !== undefined && filters.search !== "") ||
    (filters.minPrice !== undefined && filters.minPrice !== "") ||
    (filters.maxPrice !== undefined && filters.maxPrice !== "") ||
    (filters.specs !== undefined && filters.specs !== "") ||
    (filters.brandId !== undefined && filters.brandId !== "") ||
    (filters.deviceModelId !== undefined && filters.deviceModelId !== "") ||
    filters.onSale === "true";

  if (hasFilter) {
    return { robots: { index: false, follow: true } };
  }

  const target = input.categoryCanonicalPath ?? input.basePath;
  const page =
    input.page !== undefined && Number.isFinite(input.page) && input.page > 1
      ? input.page
      : undefined;

  return { canonicalPath: page ? `${target}?page=${page}` : target };
}
