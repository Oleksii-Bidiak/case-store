import { Fragment } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { permanentRedirect } from "next/navigation";
import { SearchResultsView } from "@/widgets";
import {
  resolveLegacyCatalogParams,
  withQuery,
} from "@/shared/lib/legacy-catalog-params";
import { dict, PAGE_CONTAINER, H1_CLASS } from "@/shared/config";

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

  // Breadcrumbs as on the catalogue (TASK-876): «Головна › Пошук товарів» on
  // the blank page, plus the query as the current crumb once there is one —
  // where «Пошук товарів» links back to the blank search page.
  const trail: { name: string; href?: string }[] = trimmed
    ? [
        { name: dict.catalog.breadcrumbHome, href: "/" },
        { name: dict.search.resultsTitleEmpty, href: "/search" },
        { name: `«${trimmed}»` },
      ]
    : [
        { name: dict.catalog.breadcrumbHome, href: "/" },
        { name: dict.search.resultsTitleEmpty },
      ];

  // The catalogue's shell (TASK-876): same container padding, the same
  // breadcrumb row and the same title block spacing as `/products`. No
  // subtitle under the h1 — the result count sits above the grid, as in the
  // Search mockup.
  return (
    <div className={`${PAGE_CONTAINER} py-6 sm:py-8`}>
      <nav
        aria-label={dict.product.breadcrumbAria}
        className="mb-3.5 flex flex-wrap items-center gap-2.5 text-sm text-muted-foreground"
      >
        {trail.map((crumb, i) => {
          const isLast = i === trail.length - 1;
          return (
            <Fragment key={`${crumb.name}-${i}`}>
              {i > 0 && (
                <span aria-hidden="true" className="opacity-50">
                  ›
                </span>
              )}
              {crumb.href && !isLast ? (
                <Link
                  href={crumb.href}
                  className="transition-colors hover:text-foreground"
                >
                  {crumb.name}
                </Link>
              ) : (
                <span
                  aria-current={isLast ? "page" : undefined}
                  className={isLast ? "font-medium text-foreground" : undefined}
                >
                  {crumb.name}
                </span>
              )}
            </Fragment>
          );
        })}
      </nav>

      <div className="mb-4.5">
        <h1 className={`${H1_CLASS} text-foreground`}>
          {trimmed
            ? dict.search.resultsTitle(trimmed)
            : dict.search.resultsTitleEmpty}
        </h1>
      </div>
      <SearchResultsView query={q} page={page} />
    </div>
  );
}
