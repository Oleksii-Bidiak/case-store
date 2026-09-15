import type { Metadata } from "next";
import { permanentRedirect } from "next/navigation";
import { SearchResultsView } from "@/widgets";
import {
  resolveLegacyCatalogParams,
  withQuery,
} from "@/shared/lib/legacy-catalog-params";
import { dict } from "@/shared/config";

/** Take the first value when a query param appears more than once. */
function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

type SearchPageProps = {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
};

/**
 * Serve the 308 from a pre-TASK-420 uuid facet query to its slug form. `/search`
 * migrated together with the catalogue — it carries the same filter panel, so a
 * "slug here, uuid there" split would show up as a panel that writes params the
 * other page cannot read.
 */
async function redirectLegacyParams(resolved: {
  [key: string]: string | string[] | undefined;
}): Promise<void> {
  const query = await resolveLegacyCatalogParams(resolved);
  if (query !== null) permanentRedirect(withQuery("/search", query));
}

export async function generateMetadata({
  searchParams,
}: SearchPageProps): Promise<Metadata> {
  const resolved = await searchParams;
  await redirectLegacyParams(resolved);
  const q = first(resolved.q)?.trim();
  return {
    title: q ? dict.search.resultsTitle(q) : dict.search.resultsTitleEmpty,
    description: dict.meta.productsDescription,
    // Search result pages carry no unique long-term content — keep them out of
    // the index while still allowing crawlers to follow through to products.
    robots: { index: false, follow: true },
  };
}

/**
 * `/search?q=` — full-text product search results page (TASK-075).
 *
 * Server component: resolves the async `searchParams` (Next 16) and hands the
 * query + page to the client {@link SearchResultsView}, which fetches via the
 * engine-agnostic `useSearch` hook and reuses `ProductCard`.
 */
export default async function SearchPage({ searchParams }: SearchPageProps) {
  const resolved = await searchParams;
  await redirectLegacyParams(resolved);
  const q = first(resolved.q) ?? "";
  const pageRaw = first(resolved.page);
  const page = pageRaw && Number(pageRaw) > 0 ? Number(pageRaw) : 1;
  const trimmed = q.trim();

  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-8">
      <div className="mb-8">
        <h1 className="font-display text-3xl font-extrabold tracking-tight text-foreground sm:text-4xl">
          {trimmed
            ? dict.search.resultsTitle(trimmed)
            : dict.search.resultsTitleEmpty}
        </h1>
      </div>
      <SearchResultsView query={q} page={page} />
    </div>
  );
}
