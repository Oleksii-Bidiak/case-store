"use client";

import { useEffect } from "react";
import Link from "next/link";
import { Loader2 } from "lucide-react";
import { useSearch } from "@/entities/search";
import { ProductCard } from "@/shared/ui";
import { ProductCardActions } from "@/widgets/product-card-actions";
import { ProductQuickViewTrigger } from "@/widgets/product-quick-view";
import { dict } from "@/shared/config";
import { trackEvent } from "@/shared/lib";
import { SearchResultsSkeleton } from "./search-results-skeleton";

const PAGE_SIZE = 20;

interface SearchResultsViewProps {
  /** The search query from the URL (`?q=`). May be blank. */
  query: string;
  /** 1-based page from the URL (`?page=`). */
  page: number;
}

/** Build a `/search` href for a page, preserving the query. */
function pageHref(query: string, page: number): string {
  const params = new URLSearchParams();
  if (query) params.set("q", query);
  if (page > 1) params.set("page", String(page));
  const qs = params.toString();
  return qs ? `/search?${qs}` : "/search";
}

/**
 * SearchResultsView — client widget for the `/search` results grid.
 *
 * Consumes the Orval `useSearch` hook (Meilisearch with Postgres fallback,
 * engine-agnostic) and reuses {@link ProductCard}. Handles loading, error,
 * empty, and no-query states, with simple URL-driven pagination.
 */
export function SearchResultsView({ query, page }: SearchResultsViewProps) {
  const trimmed = query.trim();
  const enabled = trimmed.length > 0;

  const { data, isPending, isFetching, isError } = useSearch(
    { q: trimmed, page, limit: PAGE_SIZE },
    { query: { enabled } },
  );

  // Analytics: report the search term once per distinct non-empty query. Keyed
  // on `trimmed`, so paging through the same query does not re-fire, and the
  // no-query state emits nothing.
  useEffect(() => {
    if (!enabled) return;
    trackEvent("search", { query: trimmed });
  }, [enabled, trimmed]);

  // No query yet — invite the shopper to search (no request fired).
  if (!enabled) {
    return (
      <div className="rounded-lg border border-border bg-card p-8 text-center">
        <p className="text-base font-medium text-card-foreground">
          {dict.search.promptHeading}
        </p>
        <p className="mt-1 text-sm text-muted-foreground">
          {dict.search.promptBody}
        </p>
      </div>
    );
  }

  if (isPending) {
    return <SearchResultsSkeleton />;
  }

  if (isError) {
    return (
      <p role="alert" className="text-sm text-destructive">
        {dict.search.error}
      </p>
    );
  }

  const products = data?.data ?? [];
  const meta = data?.meta;

  if (products.length === 0) {
    return (
      <div className="rounded-lg border border-border bg-card p-8 text-center">
        <p className="text-base font-medium text-card-foreground">
          {dict.search.emptyHeading(trimmed)}
        </p>
        <p className="mt-1 text-sm text-muted-foreground">
          {dict.search.emptyBody}
        </p>
        <Link
          href="/products"
          className="mt-3 inline-block text-sm font-medium text-primary hover:underline"
        >
          {dict.search.browseAll}
        </Link>
      </div>
    );
  }

  const totalPages = meta?.totalPages ?? 1;

  return (
    <div className="flex flex-col gap-6">
      <p aria-live="polite" className="text-sm text-muted-foreground">
        {dict.search.countFound(meta?.total ?? products.length)}
      </p>

      <div className="relative">
        {isFetching && (
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center rounded-lg bg-background/60"
          >
            <Loader2 className="size-8 animate-spin text-primary" />
          </div>
        )}
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
          {products.map((product, index) => (
            <ProductCard
              key={product.id}
              product={product}
              priority={index < 4}
              action={<ProductCardActions product={product} />}
              hoverAction={<ProductQuickViewTrigger product={product} />}
            />
          ))}
        </div>
      </div>

      {totalPages > 1 && (
        <nav
          aria-label={dict.search.paginationAria}
          className="flex items-center justify-center gap-4"
        >
          {page > 1 ? (
            <Link
              href={pageHref(trimmed, page - 1)}
              rel="prev"
              className="rounded-md px-3 py-2 text-sm font-medium text-foreground hover:bg-muted"
            >
              {dict.search.prevPage}
            </Link>
          ) : (
            <span className="rounded-md px-3 py-2 text-sm text-muted-foreground">
              {dict.search.prevPage}
            </span>
          )}
          <span className="text-sm text-muted-foreground">
            {dict.search.pageOf(page, totalPages)}
          </span>
          {page < totalPages ? (
            <Link
              href={pageHref(trimmed, page + 1)}
              rel="next"
              className="rounded-md px-3 py-2 text-sm font-medium text-foreground hover:bg-muted"
            >
              {dict.search.nextPage}
            </Link>
          ) : (
            <span className="rounded-md px-3 py-2 text-sm text-muted-foreground">
              {dict.search.nextPage}
            </span>
          )}
        </nav>
      )}
    </div>
  );
}
