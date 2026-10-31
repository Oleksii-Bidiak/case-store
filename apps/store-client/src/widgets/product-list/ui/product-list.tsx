"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { useQueries } from "@tanstack/react-query";
import { Loader2, SearchX } from "lucide-react";
import {
  useProductControllerFindAll,
  getProductControllerFindAllQueryOptions,
  type ProductControllerFindAllParams,
} from "@/entities/product";
import {
  ListingEmptyState,
  type CatalogView,
  type ListingEmptyStateAction,
} from "@/features/product-filters";
import { Button, ProductCard } from "@/shared/ui";
import { ProductCardActions } from "@/widgets/product-card-actions";
import { ProductQuickViewTrigger } from "@/widgets/product-quick-view";
import { dict } from "@/shared/config";
import { PRODUCT_GRID_CLASS } from "@/shared/config/product-grid";
import {
  accumulationKey,
  canLoadMore,
  mergeProductPages,
  nextLoadCount,
} from "../model/load-more";
import { ProductListSkeleton } from "./product-list-skeleton";
import { ProductListItem } from "./product-list-item";
import { Pagination } from "@/shared/ui/pagination";

interface ProductListProps {
  /** Active filter params (all URL-derived). */
  params: ProductControllerFindAllParams;
  /** Build a pagination href for a given page, preserving filters. */
  buildPageHref: (page: number) => string;
  /** Grid (cards) or list (rows) results layout. */
  view: CatalogView;
  /**
   * What the empty state says and offers (TASK-870). The view decides: a
   * filter reset when something narrows the list, a link out when nothing does
   * — only it knows which filters the route has locked.
   */
  empty: {
    heading: string;
    body?: string;
    action: ListingEmptyStateAction;
    /**
     * A whole empty state of the view's own — the «nothing fits your device»
     * card (TASK-2077). Mounted only when the list is empty, so whatever it
     * fetches is not paid for on a normal page.
     */
    custom?: ReactNode;
  };
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
  empty,
}: ProductListProps) {
  const { data, isPending, isFetching, isError } =
    useProductControllerFindAll(params);

  const key = accumulationKey(params);
  const basePage = params.page ?? 1;

  // The results veil is for a fetch the SHOPPER started — new filters, sort or
  // page over cached results it is about to replace. A background refetch of
  // the params already on screen (refetchOnWindowFocus after Alt+Tab) brings the
  // same cards back, and veiling them made every image blink (TASK-1995). The
  // key of the last settled result set is held with a render-time guard
  // (docs/conventions/forms.md Rule 1a); it starts at the mounted params, so a
  // remount painting from cache revalidates unveiled too (TASK-409).
  const [settledKey, setSettledKey] = useState(key);
  if (!isFetching && settledKey !== key) setSettledKey(key);
  const isRefetchingForNewParams = isFetching && settledKey !== key;

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
    if (empty.custom) return empty.custom;
    return (
      <ListingEmptyState
        icon={SearchX}
        heading={empty.heading}
        body={empty.body}
        action={empty.action}
      />
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
        {isRefetchingForNewParams && (
          <div
            aria-hidden="true"
            data-testid="results-refetch-overlay"
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
          // 1 / 2 / 3 / 4 columns (TASK-415, TASK-1957) — the shared
          // `PRODUCT_GRID_CLASS`, which `ProductListSkeleton` uses too, so the
          // skeleton lays out in exactly the columns of the cards that replace
          // it. See the constant for the breakpoints and the gap.
          <div className={PRODUCT_GRID_CLASS}>
            {products.map((product, index) => (
              <ProductCard
                key={product.id}
                product={product}
                // First row is above the fold — load eagerly for LCP.
                priority={index < 4}
                // Same height for every card, whatever its data — the box
                // `ProductListSkeleton` draws for it (TASK-869).
                reserveRows
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
