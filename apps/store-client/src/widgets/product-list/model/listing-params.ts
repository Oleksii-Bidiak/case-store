import type { ProductControllerFindAllParams } from "@/entities/product";

/**
 * The ONE place a catalogue URL becomes the product-listing query (TASK-563).
 *
 * The listing routes prefetch the first page on the server and hand it to the
 * client through a `HydrationBoundary`, so the first HTML already carries the
 * product cards (and their `<a href="/products/…">` links) instead of a
 * skeleton. That only works when the server's query key and the client's are
 * the SAME key: React Query matches them by a hash of the params object, so a
 * single differing value — a search term trimmed on one side only, a `specs=`
 * read as `""` here and `undefined` there — sends the client to a different
 * cache entry. It then renders a skeleton over the server's cards, which is a
 * hydration mismatch, not merely a wasted request.
 *
 * Hence one pure builder, called by the server page with its awaited
 * `searchParams` and by `ProductListView` with `useSearchParams()`. Both read
 * the same URL through the same rules, so the keys cannot drift apart.
 */

/** Reads one query parameter — the first value when it appears more than once. */
export type ListingParamReader = (key: string) => string | null | undefined;

/** Axes a route fixes by its own path segment (never read from the query). */
export interface ListingLocks {
  /** `/categories/[slug]`, `/catalog/[category]/…` — the category slug. */
  categorySlug?: string;
  /** `/catalog/[category]/[device]` — the device-model slug. */
  deviceSlug?: string;
}

/** Page size of the catalogue grid (the numbered pagination counts in it). */
export const CATALOG_PAGE_SIZE = 20;

/** A present, non-blank value — anything else is "no such parameter". */
function present(value: string | null | undefined): string | undefined {
  return value === null || value === undefined || value === ""
    ? undefined
    : value;
}

/**
 * Build the `/api/products` params for one catalogue URL.
 *
 * Rules (each one is what the listing did before TASK-563, now written once):
 * - taxonomy axes are SLUGS (TASK-420); a route lock always wins over the query;
 * - `search` is trimmed, and blank means no search;
 * - sort defaults to newest first;
 * - prices are numbers when given;
 * - `inStock` / `onSale` filter only on the literal `"true"` (TASK-414/742) —
 *   the API's own boolean transform reads `"false"` the same way;
 * - page defaults to 1; the page size and `isActive` are fixed.
 */
export function buildCatalogListingParams(
  read: ListingParamReader,
  locks: ListingLocks = {},
): ProductControllerFindAllParams {
  const minPrice = present(read("minPrice"));
  const maxPrice = present(read("maxPrice"));
  const page = present(read("page"));

  return {
    category: locks.categorySlug ?? present(read("category")),
    brand: present(read("brand")),
    device: locks.deviceSlug ?? present(read("device")),
    search: read("search")?.trim() || undefined,
    sortBy: present(read("sortBy")) ?? "createdAt",
    sortOrder: present(read("sortOrder")) ?? "desc",
    minPrice: minPrice ? Number(minPrice) : undefined,
    maxPrice: maxPrice ? Number(maxPrice) : undefined,
    specs: present(read("specs")),
    inStock: read("inStock") === "true" ? true : undefined,
    onSale: read("onSale") === "true" ? true : undefined,
    page: page ? Number(page) : 1,
    limit: CATALOG_PAGE_SIZE,
    isActive: true,
  };
}

/**
 * Reader over a Next.js `searchParams` record (server side): the first value of
 * a repeated parameter, exactly what `URLSearchParams.get` returns client-side.
 */
export function readSearchParamsRecord(record: {
  [key: string]: string | string[] | undefined;
}): ListingParamReader {
  return (key) => {
    const value = record[key];
    return Array.isArray(value) ? value[0] : value;
  };
}
