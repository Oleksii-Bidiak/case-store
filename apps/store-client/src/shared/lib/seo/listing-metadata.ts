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

/** A string filter counts as present when defined and non-empty (Decision 4). */
function isPresent(value: string | undefined): boolean {
  return value !== undefined && value !== "";
}

/** Decision 2/4 — does any filter param narrow this view's result set? */
function hasAnyFilter(filters: ListingFilterParams): boolean {
  return (
    isPresent(filters.search) ||
    isPresent(filters.minPrice) ||
    isPresent(filters.maxPrice) ||
    isPresent(filters.specs) ||
    isPresent(filters.brandId) ||
    isPresent(filters.deviceModelId) ||
    // Boolean-shaped on the wire: only the literal "true" is a filter —
    // `?onSale=false` is a no-op, not "filtering by not-on-sale".
    filters.onSale === "true"
  );
}

/** Decision 3 — normalize to a page number worth a `?page=N` suffix, or undefined. */
function normalizePage(page: number | undefined): number | undefined {
  return page !== undefined && Number.isFinite(page) && page > 1
    ? page
    : undefined;
}

export function buildListingMetadata(
  input: ListingMetadataInput,
): ListingMetadataResult {
  // Decision 2 — a filtered view is noindex,follow and gets NO canonical: the
  // two are mutually exclusive signals, never emitted together.
  if (hasAnyFilter(input.filters ?? {})) {
    return { robots: { index: false, follow: true } };
  }

  // Decision 3 — the category landing absorbs the `?categoryId=` view's
  // canonical; otherwise the listing is its own home.
  const target = input.categoryCanonicalPath ?? input.basePath;
  const page = normalizePage(input.page);

  return { canonicalPath: page ? `${target}?page=${page}` : target };
}
