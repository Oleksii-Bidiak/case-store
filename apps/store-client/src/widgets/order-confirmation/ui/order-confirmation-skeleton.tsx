import { Skeleton } from "@/shared/ui";

/**
 * OrderConfirmationSkeleton — loading placeholder for the order confirmation
 * page, drawn block for block from OrderConfirmationView (TASK-869,
 * design-system §6 "skeletons that match the final layout"):
 *
 * - header: the H1 slot (`h-9 md:h-10`, one H1_CLASS line), the number and
 *   date lines, the two status badges;
 * - from `lg` the same `grid-cols-3` split — items, address and the CTA row in
 *   the 2/3 column, the totals card in the 1/3 aside; below `lg` the aside
 *   follows the column, as on the page.
 *
 * The stepper is NOT here: the page renders it above its `<Suspense>`, and
 * `loading.tsx` renders the real one above this skeleton, so both paths show
 * the same three steps in the same place. The payment panel is not reserved
 * either — a cash-on-delivery order has none, and a slot for it would make
 * that page jump the other way.
 *
 * Server-compatible; used as a <Suspense> fallback and while auth/order load.
 */
export function OrderConfirmationSkeleton() {
  return (
    <div
      aria-hidden="true"
      data-testid="order-confirmation-skeleton"
      className="flex flex-col gap-8"
    >
      {/* Header — OrderConfirmationHeader */}
      <div className="flex flex-col gap-3">
        <Skeleton className="h-9 w-72 max-w-full md:h-10 md:w-96" />
        <div className="flex flex-col gap-1">
          <Skeleton className="h-5 w-52" />
          <Skeleton className="h-5 w-60" />
        </div>
        <div className="flex flex-wrap gap-2">
          <Skeleton className="h-6 w-36 rounded-full" />
          <Skeleton className="h-6 w-40 rounded-full" />
        </div>
      </div>

      <div className="flex flex-col gap-8 lg:grid lg:grid-cols-3">
        <div className="flex flex-col gap-8 lg:col-span-2">
          {/* OrderItemList — h2 + rows with a 56px thumb */}
          <div className="flex flex-col gap-4">
            <Skeleton className="h-7 w-48" />
            <div className="flex flex-col gap-4">
              {Array.from({ length: 3 }).map((_, i) => (
                <div
                  key={i}
                  className="flex items-start justify-between gap-3 border-b border-border pb-4"
                >
                  <div className="flex flex-1 items-start gap-3">
                    <Skeleton className="size-14 shrink-0 rounded-lg" />
                    <div className="flex flex-1 flex-col gap-1">
                      <Skeleton className="h-5 w-3/4" />
                      <Skeleton className="h-5 w-24" />
                    </div>
                  </div>
                  <Skeleton className="h-5 w-16" />
                </div>
              ))}
            </div>
          </div>

          {/* OrderAddressSummary — h2 + name and four address lines */}
          <div className="flex flex-col gap-1">
            <Skeleton className="mb-1 h-7 w-44" />
            <Skeleton className="h-5 w-40" />
            <Skeleton className="h-5 w-64 max-w-full" />
            <Skeleton className="h-5 w-24" />
            <Skeleton className="h-5 w-20" />
            <Skeleton className="h-5 w-36" />
          </div>

          {/* CTA row — «Продовжити покупки» */}
          <Skeleton className="h-12 w-56 rounded-cta" />
        </div>

        {/* OrderTotalsBreakdown */}
        <div className="flex flex-col gap-3 rounded-card border border-border bg-card p-6 lg:col-span-1 lg:self-start">
          <Skeleton className="h-7 w-48" />
          <div className="flex justify-between">
            <Skeleton className="h-5 w-16" />
            <Skeleton className="h-5 w-20" />
          </div>
          <div className="flex justify-between">
            <Skeleton className="h-5 w-20" />
            <Skeleton className="h-5 w-12" />
          </div>
          <Skeleton className="h-px w-full" />
          <div className="flex justify-between">
            <Skeleton className="h-6 w-16" />
            <Skeleton className="h-6 w-24" />
          </div>
        </div>
      </div>
    </div>
  );
}
