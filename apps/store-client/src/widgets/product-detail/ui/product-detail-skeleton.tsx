import { Skeleton } from "@/shared/ui";

/**
 * ProductDetailSkeleton — loading placeholder for the product detail page.
 * Mirrors the real ProductDetailView layout block-for-block (TASK-214):
 * breadcrumb row, the three-column hero (`1fr 1fr 360px` on lg — gallery with
 * square main frame + 64px thumbnail strip, info column with title/rating/
 * variant selector, bordered buy-box card with price/stock/CTA/trust rows) and
 * the tabs section — so hydration causes no jarring reflow at mobile or
 * desktop breakpoints. Container classes (grid template, gaps, paddings,
 * radii) are copied from the view; keep them in sync when the view changes.
 * Server-compatible (no client interactivity); used as a <Suspense> fallback.
 */
export function ProductDetailSkeleton() {
  return (
    <div aria-hidden="true" className="flex flex-col gap-10 pb-24 md:pb-0">
      {/* Breadcrumb trail (single text-sm row). */}
      <Skeleton className="h-5 w-72 max-w-full" />

      {/* Hero: gallery + info + buy box — same grid as the view. */}
      <div className="grid grid-cols-1 gap-7 lg:grid-cols-[1fr_1fr_360px] lg:items-start">
        {/* Gallery: square main frame + 64px thumbnail strip. */}
        <div className="flex flex-col gap-4">
          <Skeleton className="aspect-square w-full rounded-xl" />
          <div className="flex gap-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="size-16 shrink-0 rounded-lg" />
            ))}
          </div>
        </div>

        {/* Info column: title (up to two lines), rating/SKU row, variant selector. */}
        <div className="flex min-w-0 flex-col gap-[18px]">
          <div className="flex flex-col gap-2">
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-8 w-2/3" />
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

        {/* Buy box: real card chrome with skeleton rows inside. */}
        <div className="rounded-[18px] border border-border bg-card p-[22px]">
          <div className="mb-1 flex flex-wrap items-end gap-3">
            <Skeleton className="h-10 w-36" />
            <Skeleton className="h-5 w-24" />
          </div>
          <Skeleton className="mb-4 h-5 w-28" />
          <div className="mb-2.5 flex items-stretch gap-2.5">
            <Skeleton className="h-12 flex-1 rounded-lg" />
            <Skeleton className="size-12 shrink-0 rounded-lg" />
          </div>
          <Skeleton className="h-12 w-full rounded-lg" />
          {/* Trust badges: three icon + two-line rows under a divider. */}
          <div className="mt-[18px] flex flex-col gap-[13px] border-t border-border pt-4">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="flex items-start gap-[11px]">
                <Skeleton className="size-5 shrink-0" />
                <div className="flex flex-1 flex-col gap-1.5">
                  <Skeleton className="h-3.5 w-32" />
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
