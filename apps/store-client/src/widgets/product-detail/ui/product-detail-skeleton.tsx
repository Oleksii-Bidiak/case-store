import { Skeleton } from "@/shared/ui";
import { STICKY_ASIDE_TOP } from "@/shared/config";

/**
 * ProductDetailSkeleton — loading placeholder for the product detail page.
 * Mirrors the real ProductDetailView layout block-for-block (TASK-214):
 * breadcrumb row, the hero (one column below 1024px, two equal halves from
 * 1024px — Product mockup §6.1 — with the gallery sticky beside ONE info
 * column: title, price and stock, variant chips, the 56px buy row and the
 * services card) and the tabs section — so hydration causes no jarring reflow
 * at mobile, tablet or desktop breakpoints. Container classes (grid template,
 * sticky offset, gaps, paddings, radii) are copied from the view VERBATIM;
 * keep them in sync when the view changes (TASK-416).
 *
 * The compatibility row is not drawn: it depends on the product's data and
 * on a client-only device, so the skeleton cannot know whether it renders.
 * The buy row draws exactly what a shopper gets by default (TASK-832): ONE
 * CTA and the heart. The compare square and the «Купити в 1 клік» bar are
 * parked stubs the view renders only behind `FEATURE_STUBS` (off everywhere).
 * Server-compatible (no client interactivity); used as a <Suspense> fallback.
 */
export function ProductDetailSkeleton() {
  return (
    <div
      aria-hidden="true"
      data-testid="product-detail-skeleton"
      className="flex flex-col gap-10 pb-30 lg:pb-0"
    >
      {/* Breadcrumb trail (single text-sm row). */}
      <Skeleton className="h-5 w-72 max-w-full" />

      {/* Hero: gallery + info — same grid as the view. */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2 lg:items-start lg:gap-10">
        {/* Gallery: square main frame + 64px thumbnail strip. */}
        <div className={`relative lg:sticky ${STICKY_ASIDE_TOP}`}>
          <div className="flex flex-col gap-4">
            <Skeleton className="aspect-square w-full rounded-xl" />
            <div className="flex gap-2">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="size-16 shrink-0 rounded-lg" />
              ))}
            </div>
          </div>
        </div>

        <div className="flex min-w-0 flex-col gap-4.5">
          {/* Brand, title (up to two H1 line boxes — 36px lines, 40px from
              md) and the rating/code row. */}
          <div className="flex flex-col gap-1">
            <Skeleton className="h-5 w-20" />
            <Skeleton className="h-9 w-full md:h-10" />
            <Skeleton className="h-9 w-2/3 md:h-10" />
            <Skeleton className="mt-1 h-5 w-56 max-w-full" />
          </div>
          {/* Price (a 30px figure in a 36px line box) and the stock line. */}
          <div>
            <Skeleton className="h-9 w-36" />
            <Skeleton className="mt-2 h-5 w-28" />
          </div>
          {/* Variant chips. */}
          <div className="flex flex-col gap-2">
            <Skeleton className="h-5 w-24" />
            <div className="flex flex-wrap gap-1.5">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-11 w-20 rounded-full lg:h-10" />
              ))}
            </div>
          </div>
          {/* The buy row: the one 56px CTA and the 56px heart. */}
          <div
            data-testid="product-detail-skeleton-buy-box"
            className="flex items-stretch gap-2.5"
          >
            <Skeleton
              data-testid="product-detail-skeleton-cta"
              className="h-14 w-full flex-1 rounded-cta"
            />
            <Skeleton className="size-14 shrink-0 rounded-cta" />
          </div>
          {/* Services card: three icon-tile rows. */}
          <div className="flex flex-col gap-3 rounded-card border border-border bg-card p-4 shadow-card md:p-5">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="flex items-center gap-3">
                <Skeleton className="size-10 shrink-0 rounded-menu" />
                <div className="flex flex-1 flex-col gap-2">
                  <Skeleton className="h-4 w-32" />
                  <Skeleton className="h-3 w-44 max-w-full" />
                </div>
              </div>
            ))}
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
