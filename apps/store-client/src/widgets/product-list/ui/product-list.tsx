"use client";

import { useEffect, useRef, useState } from "react";
import { useQueries } from "@tanstack/react-query";
import { Loader2, SearchX } from "lucide-react";
import {
  useProductControllerFindAll,
  getProductControllerFindAllQueryOptions,
  type ProductControllerFindAllParams,
} from "@/entities/product";
import type { CatalogView } from "@/features/product-filters";
import { Button, ProductCard } from "@/shared/ui";
import { ProductCardActions } from "@/widgets/product-card-actions";
import { ProductQuickViewTrigger } from "@/widgets/product-quick-view";
import { dict } from "@/shared/config";
import {
  accumulationKey,
  canLoadMore,
  mergeProductPages,
  nextLoadCount,
} from "../model/load-more";
import { ProductListSkeleton } from "./product-list-skeleton";
import { ProductListItem } from "./product-list-item";
import { Pagination } from "./pagination";

interface ProductListProps {
  /** Active filter params (all URL-derived). */
  params: ProductControllerFindAllParams;
  /** Build a pagination href for a given page, preserving filters. */
  buildPageHref: (page: number) => string;
  /** Grid (cards) or list (rows) results layout. */
  view: CatalogView;
  /** Clear every active filter (used by the empty state). */
  onClearFilters: () => void;
}

/**
 * Renders the paginated product results for the current filter params, in grid
 * or list layout, with loading / error / empty states. Data comes from the
 * Orval-generated hook, keyed on `params`, so any filter change refetches.
 *
 * Load-more (TASK-216): the URL's `?page=` anchors the BASE page; «Показати ще»
 * appends the following pages client-side via `useQueries` over the generated
 * query options, without touching the URL or scroll position. The appended
 * count is keyed by `accumulationKey(params)` and read through a render-time
 * guard, so ANY change to filters/sort/base page (including back/forward
 * navigation) resets the list to the base page alone. Numbered pagination stays
 * below as the SEO/deep-link navigation and always reflects the base page.
 */
export function ProductList({
  params,
  buildPageHref,
  view,
  onClearFilters,
}: ProductListProps) {
  const { data, isPending, isFetching, isError } =
    useProductControllerFindAll(params);

  const key = accumulationKey(params);
  const basePage = params.page ?? 1;

  // Appended-pages count, valid only for the result set it was created for
  // (render-time reset guard — docs/conventions/forms.md Rule 1a).
  const [accum, setAccum] = useState({ key, extra: 0 });
  const extraPages = accum.key === key ? accum.extra : 0;

  const extraResults = useQueries({
    queries: Array.from({ length: extraPages }, (_, i) =>
      getProductControllerFindAllQueryOptions({
        ...params,
        page: basePage + 1 + i,
      }),
    ),
  });

  const isAppending = extraResults.some((result) => result.isPending);
  const appendFailed = extraResults.filter((result) => result.isError);

  // Focus management: when the FINAL page lands and the button unmounts, move
  // focus to the status line so keyboard users are not dropped to <body>.
  const statusRef = useRef<HTMLParagraphElement>(null);
  const focusStatusOnComplete = useRef(false);

  const meta = data?.meta;
  const hasMore = meta
    ? canLoadMore(basePage, extraPages, meta.totalPages)
    : false;

  useEffect(() => {
    if (!hasMore && !isAppending && focusStatusOnComplete.current) {
      focusStatusOnComplete.current = false;
      statusRef.current?.focus();
    }
  }, [hasMore, isAppending]);

  if (isPending) {
    return <ProductListSkeleton view={view} />;
  }

  if (isError) {
    return (
      <p role="alert" className="text-sm text-destructive">
        {dict.catalog.productsError}
      </p>
    );
  }

  const products = mergeProductPages([
    data?.data,
    ...extraResults.map((result) => result.data?.data),
  ]);

  if (products.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-[18px] border border-border bg-card px-5 py-14 text-center shadow-card">
        <span
          aria-hidden="true"
          className="mb-[18px] inline-flex size-[72px] items-center justify-center rounded-full bg-muted text-muted-foreground"
        >
          <SearchX className="size-8" strokeWidth={1.6} />
        </span>
        <p className="max-w-[460px] font-display text-[22px] font-bold text-foreground">
          {dict.catalog.emptyHeading}
        </p>
        <p className="mt-2.5 max-w-[440px] text-sm text-muted-foreground">
          {dict.catalog.emptyBody}
        </p>
        <Button
          type="button"
          variant="outline"
          className="mt-5"
          onClick={onClearFilters}
        >
          {dict.catalog.clearFilters}
        </Button>
      </div>
    );
  }

  const nextCount = meta
    ? nextLoadCount(meta.total, meta.limit, basePage + extraPages)
    : 0;

  const handleLoadMore = () => {
    if (isAppending) return; // aria-disabled guard — keeps focus on the button
    // A failed append is retried in place instead of appending another page.
    if (appendFailed.length > 0) {
      for (const result of appendFailed) void result.refetch();
      return;
    }
    if (!meta) return;
    const nextExtra = extraPages + 1;
    if (!canLoadMore(basePage, nextExtra, meta.totalPages)) {
      focusStatusOnComplete.current = true;
    }
    setAccum({ key, extra: nextExtra });
  };

  return (
    <div className="flex flex-col gap-6">
      <p aria-live="polite" className="text-sm text-muted-foreground">
        {dict.catalog.countFound(meta?.total ?? products.length)}
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

        {view === "list" ? (
          <div className="flex flex-col gap-3.5">
            {products.map((product) => (
              <ProductListItem key={product.id} product={product} />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-[18px] sm:[grid-template-columns:repeat(auto-fill,minmax(232px,1fr))]">
            {products.map((product, index) => (
              <ProductCard
                key={product.id}
                product={product}
                // First row is above the fold — load eagerly for LCP.
                priority={index < 4}
                action={<ProductCardActions product={product} />}
                hoverAction={<ProductQuickViewTrigger product={product} />}
              />
            ))}
          </div>
        )}
      </div>

      {meta && meta.totalPages > 1 && (
        <div className="flex flex-col items-center gap-3">
          <p
            ref={statusRef}
            tabIndex={-1}
            aria-live="polite"
            className="text-sm text-muted-foreground outline-none"
          >
            {dict.catalog.shownOfTotal(products.length, meta.total)}
          </p>

          {appendFailed.length > 0 && (
            <p role="alert" className="text-sm text-destructive">
              {dict.catalog.loadMoreError}
            </p>
          )}

          {hasMore && (
            <Button
              type="button"
              variant="outline"
              size="lg"
              onClick={handleLoadMore}
              aria-disabled={isAppending}
              aria-busy={isAppending}
              className="min-w-[240px]"
            >
              {isAppending ? (
                <>
                  <Loader2 aria-hidden="true" className="size-4 animate-spin" />
                  {dict.catalog.loadMoreLoading}
                </>
              ) : (
                dict.catalog.loadMore(nextCount)
              )}
            </Button>
          )}

          <Pagination
            currentPage={meta.page}
            totalPages={meta.totalPages}
            buildHref={buildPageHref}
          />
        </div>
      )}
    </div>
  );
}
