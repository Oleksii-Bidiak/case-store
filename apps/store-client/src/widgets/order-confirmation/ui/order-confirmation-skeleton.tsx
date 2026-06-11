import { Skeleton } from "@/shared/ui";

/**
 * OrderConfirmationSkeleton — loading placeholder for the order confirmation
 * page. Mirrors the layout of OrderConfirmationView: a header block on top, then
 * a two-column section (item list + address on the left, totals on the right).
 * Server-compatible; used as a <Suspense> fallback and while auth/order load.
 */
export function OrderConfirmationSkeleton() {
  return (
    <div aria-hidden="true" className="flex flex-col gap-8">
      {/* Header */}
      <div className="flex flex-col gap-3">
        <Skeleton className="h-9 w-72" />
        <Skeleton className="h-5 w-48" />
        <div className="flex gap-2">
          <Skeleton className="h-6 w-24" />
          <Skeleton className="h-6 w-24" />
        </div>
      </div>

      <div className="flex flex-col gap-8 lg:grid lg:grid-cols-3">
        {/* Items + address */}
        <div className="flex flex-col gap-6 lg:col-span-2">
          <Skeleton className="h-7 w-40" />
          {Array.from({ length: 3 }).map((_, i) => (
            <div
              key={i}
              className="flex items-center justify-between border-b border-border pb-4"
            >
              <Skeleton className="h-5 w-2/3" />
              <Skeleton className="h-5 w-16" />
            </div>
          ))}
          <Skeleton className="h-7 w-44" />
          <Skeleton className="h-24 w-full" />
        </div>

        {/* Totals */}
        <div className="flex flex-col gap-4 rounded-lg border border-border bg-card p-6 lg:col-span-1 lg:self-start">
          <Skeleton className="h-6 w-32" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-px w-full" />
          <Skeleton className="h-6 w-2/3" />
        </div>
      </div>
    </div>
  );
}
