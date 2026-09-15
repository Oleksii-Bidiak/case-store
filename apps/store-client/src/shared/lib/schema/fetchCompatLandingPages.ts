import { catalogLandingControllerFindCompatPages } from "@/shared/api/generated/catalog/catalog";

/** Sitemap-shaped view of one compatibility landing page. */
export interface CompatLandingRoute {
  categorySlug: string;
  deviceSlug: string;
}

/**
 * Fetch every compatibility landing page that exists —
 * `/catalog/<категорія>/<модель>` (TASK-490) — using the Orval plain fetcher
 * (server-only, NOT a React hook). Used by app/sitemap.ts.
 *
 * The API is the single authority on WHICH pairs are pages: the same aggregate
 * answers this list and the page's own existence check, over the same listing
 * `where` builder. So the sitemap cannot list a URL that 404s, and a URL that
 * answers 200 cannot be missing from the sitemap — the acceptance criterion
 * («кількість сторінок = активні пари з ≥1 товаром») is a property of there
 * being one source, not of two implementations agreeing.
 *
 * Deliberately NOT enriched with a `lastModified`: a pair has no row and
 * therefore no timestamp of its own, and the nearest honest one — "any product
 * in this slice changed" — is a lie the moment an unrelated position in the
 * category is edited. `sitemap.ts` stamps the request time instead, exactly as
 * it already does for a blog post with no `publishedAt`.
 *
 * Throws on HTTP error; the caller wraps this in try/catch so one dead source
 * never drops the others.
 */
export async function fetchAllCompatLandingPages(): Promise<
  CompatLandingRoute[]
> {
  const { data } = await catalogLandingControllerFindCompatPages();
  return (data ?? []).map((page) => ({
    categorySlug: page.categorySlug,
    deviceSlug: page.deviceSlug,
  }));
}
