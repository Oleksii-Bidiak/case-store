import { Skeleton } from "@/shared/ui";
import { STICKY_ASIDE_TOP } from "@/shared/config";

/**
 * ProductDetailSkeleton — loading placeholder for the product detail page.
 * Mirrors the real ProductDetailView layout block-for-block (TASK-214):
 * breadcrumb row, the responsive hero (one column on phones, `1fr 360px` from
 * 768px with the buy box spanning both rows, `1fr 1fr 360px` from 1024px —
 * gallery with square main frame + 64px thumbnail strip, info column with
 * brand/title/rating/variant selector, the sticky buy-box rail with its card
 * chrome and price/stock/CTA/trust rows) and the tabs section — so hydration
 * causes no jarring reflow at mobile, tablet or desktop breakpoints. Container
 * classes (grid template, column/row placement, sticky offset, gaps, paddings,
 * radii) are copied from the view VERBATIM; keep them in sync when the view
 * changes (TASK-416).
 *
 * The buy box draws exactly what a shopper gets by default (TASK-832): ONE
 * full-width CTA. The compare square and the «Купити в 1 клік» bar are parked
 * stubs the view renders only behind `FEATURE_STUBS` (off everywhere), so a
 * skeleton that drew them promised two controls that never arrive and left a
 * 58px hole under the CTA when the page landed.
 * Server-compatible (no client interactivity); used as a <Suspense> fallback.
 */
export function ProductDetailSkeleton() {
  return (
    <div
      aria-hidden="true"
      data-testid="product-detail-skeleton"
      className="flex flex-col gap-10 pb-24 md:pb-0"
    >
      {/* Breadcrumb trail (single text-sm row). */}
      <Skeleton className="h-5 w-72 max-w-full" />

      {/* Hero: gallery + info + buy box — same grid as the view. */}
      {/* eslint-disable-next-line tailwindcss/no-arbitrary-value -- fixed+fluid column layout has no named grid-cols-N equivalent */}
      <div className="grid grid-cols-1 gap-7 md:grid-cols-[1fr_360px] md:items-start lg:grid-cols-[1fr_1fr_360px]">
        {/* Gallery: square main frame + 64px thumbnail strip. */}
        <div className="flex flex-col gap-4">
          <Skeleton className="aspect-square w-full rounded-xl" />
          <div className="flex gap-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="size-16 shrink-0 rounded-lg" />
            ))}
          </div>
        </div>

        {/* Info column: brand link, title (up to two H1 line boxes — H1_CLASS
            is 36px lines, 40px from md), rating/SKU row, variant selector. */}
        <div className="flex min-w-0 flex-col gap-4 md:gap-6 md:col-start-1 md:row-start-2 lg:col-start-2 lg:row-start-1">
          <div className="flex flex-col gap-1.5">
            <Skeleton className="h-5 w-20" />
            <Skeleton className="h-9 w-full md:h-10" />
            <Skeleton className="h-9 w-2/3 md:h-10" />
          </div>
          <Skeleton className="h-5 w-56 max-w-full" />
          <div className="flex flex-col gap-2">
            <Skeleton className="h-5 w-24" />
            <div className="flex flex-wrap gap-2">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-10 w-24 rounded-lg" />
              ))}
            </div>
          </div>
        </div>

        {/* Buy box: the view's sticky rail + card chrome with skeleton rows
            inside — price (the 32px display figure sits in a 48px line box)
            and the old price, the stock line, the one CTA (AddToCartButton:
            48px, rounded-lg) and the trust badges (each row 44px: a 20px
            title over a description in a 24px inline line box). */}
        <div
          data-testid="product-detail-skeleton-buy-box"
          className={`md:sticky ${STICKY_ASIDE_TOP} md:col-start-2 md:row-span-2 md:row-start-1 lg:col-start-3 lg:row-span-1`}
        >
          <div className="rounded-card border border-border bg-card p-[22px] shadow-card">
            <div className="mb-1 flex flex-wrap items-end gap-3">
              <Skeleton className="h-12 w-36" />
              <Skeleton className="mb-1.5 h-5 w-24" />
            </div>
            <Skeleton className="mb-4 h-5 w-28" />
            <Skeleton
              data-testid="product-detail-skeleton-cta"
              className="mb-2.5 h-12 w-full rounded-lg"
            />
            {/* Trust badges: three icon + two-line rows under a divider. */}
            <div className="mt-[18px] flex flex-col gap-[13px] border-t border-border pt-4">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="flex items-start gap-[11px]">
                  <Skeleton className="size-5 shrink-0" />
                  <div className="flex flex-1 flex-col gap-3">
                    <Skeleton className="h-4 w-32" />
                    <Skeleton className="h-4 w-44 max-w-full" />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Tabs: trigger list + first-tab text block. */}
      <div className="w-full">
        <Skeleton className="h-9 w-full max-w-2xl rounded-lg" />
        <div className="flex max-w-3xl flex-col gap-2 pt-5">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-2/3" />
        </div>
      </div>
    </div>
  );
}
