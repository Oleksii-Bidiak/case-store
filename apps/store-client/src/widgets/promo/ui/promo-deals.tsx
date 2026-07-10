"use client";

import { useState } from "react";
import { useQueries } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import {
  useProductControllerFindAll,
  getProductControllerFindAllQueryOptions,
  type ProductControllerFindAllParams,
} from "@/entities/product";
import { useCategoryControllerGetRootCategories } from "@/entities/category";
import { Button, ProductCard, Skeleton } from "@/shared/ui";
import { ProductCardActions } from "@/widgets/product-card-actions";
import { dict } from "@/shared/config";
import {
  canLoadMoreDeals,
  mergeDealPages,
  nextDealsLoadCount,
} from "../model/deals-pagination";

const TAB_BASE =
  "h-[38px] rounded-[10px] border px-4 text-[13.5px] font-semibold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring";

/** Page size for the on-sale grid. */
const DEALS_LIMIT = 12;

/**
 * PromoDeals — the "Товари зі знижкою" section: real root categories as filter
 * tabs over the live product listing, filtered SERVER-side to on-sale positions
 * via the `onSale` param (TASK-179). A "Показати ще" control appends the next
 * page client-side (`useQueries` over the generated query options, same
 * technique as the catalog `ProductList`), with pagination reset on a category
 * change through a render-time key guard (docs/conventions/forms.md). Cards
 * reuse the shared ProductCard + ProductCardActions (real add-to-cart /
 * wishlist).
 */
export function PromoDeals() {
  const [categoryId, setCategoryId] = useState<string | null>(null);

  const { data: catData } = useCategoryControllerGetRootCategories({
    isActive: true,
    sortBy: "sortOrder",
    sortOrder: "asc",
  });
  const categories = catData?.data ?? [];

  const params: ProductControllerFindAllParams = {
    isActive: true,
    onSale: true,
    limit: DEALS_LIMIT,
    sortBy: "createdAt",
    sortOrder: "desc",
    ...(categoryId ? { categoryId } : {}),
  };

  const { data, isPending, isError } = useProductControllerFindAll(params);

  // Accumulated extra pages, valid only for the category they were loaded for
  // (render-time reset guard — a mismatched key reads as zero appended pages).
  const key = categoryId ?? "__all__";
  const [accum, setAccum] = useState({ key, extra: 0 });
  const extraPages = accum.key === key ? accum.extra : 0;

  const extraResults = useQueries({
    queries: Array.from({ length: extraPages }, (_, i) =>
      getProductControllerFindAllQueryOptions({ ...params, page: 2 + i }),
    ),
  });

  const isAppending = extraResults.some((result) => result.isPending);
  const appendFailed = extraResults.filter((result) => result.isError);

  const meta = data?.meta;
  const loadedPages = 1 + extraPages;
  const hasMore = meta ? canLoadMoreDeals(loadedPages, meta.totalPages) : false;

  const deals = mergeDealPages([
    data?.data,
    ...extraResults.map((result) => result.data?.data),
  ]);

  const nextCount = meta
    ? nextDealsLoadCount(meta.total, meta.limit, loadedPages)
    : 0;

  const handleLoadMore = () => {
    if (isAppending) return; // aria-disabled guard
    if (appendFailed.length > 0) {
      for (const result of appendFailed) void result.refetch();
      return;
    }
    setAccum({ key, extra: extraPages + 1 });
  };

  return (
    <section id="deals" className="mt-10 scroll-mt-24">
      <div className="mb-[18px] flex flex-wrap items-center justify-between gap-4">
        <h2 className="font-display text-2xl font-bold tracking-tight text-foreground">
          {dict.promo.dealsHeading}
        </h2>
        <div
          role="group"
          aria-label={dict.promo.dealsFilterAria}
          className="flex flex-wrap gap-2"
        >
          <button
            type="button"
            aria-pressed={categoryId === null}
            onClick={() => setCategoryId(null)}
            className={`${TAB_BASE} ${
              categoryId === null
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border bg-card text-foreground hover:border-primary"
            }`}
          >
            {dict.promo.dealsAll}
          </button>
          {categories.map((category) => {
            const active = category.id === categoryId;
            return (
              <button
                key={category.id}
                type="button"
                aria-pressed={active}
                onClick={() => setCategoryId(category.id)}
                className={`${TAB_BASE} ${
                  active
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border bg-card text-foreground hover:border-primary"
                }`}
              >
                {category.name}
              </button>
            );
          })}
        </div>
      </div>

      {isPending ? (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(232px,1fr))] gap-[18px]">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-[430px] w-full rounded-2xl" />
          ))}
        </div>
      ) : isError ? (
        <p role="alert" className="text-sm text-destructive">
          {dict.promo.dealsError}
        </p>
      ) : deals.length === 0 ? (
        <p className="text-sm text-muted-foreground">{dict.promo.dealsEmpty}</p>
      ) : (
        <>
          <div className="grid grid-cols-[repeat(auto-fill,minmax(232px,1fr))] gap-[18px]">
            {deals.map((product, index) => (
              <ProductCard
                key={product.id}
                product={product}
                priority={index < 4}
                action={<ProductCardActions product={product} />}
              />
            ))}
          </div>

          {meta && meta.totalPages > 1 && (
            <div className="mt-6 flex flex-col items-center gap-3">
              <p aria-live="polite" className="text-sm text-muted-foreground">
                {dict.promo.dealsShownOfTotal(deals.length, meta.total)}
              </p>

              {appendFailed.length > 0 && (
                <p role="alert" className="text-sm text-destructive">
                  {dict.promo.dealsLoadMoreError}
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
                      <Loader2
                        aria-hidden="true"
                        className="size-4 animate-spin"
                      />
                      {dict.promo.dealsLoadMoreLoading}
                    </>
                  ) : (
                    dict.promo.dealsLoadMore(nextCount)
                  )}
                </Button>
              )}
            </div>
          )}
        </>
      )}
    </section>
  );
}
