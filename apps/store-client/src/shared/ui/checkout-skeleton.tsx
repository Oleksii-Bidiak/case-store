import { Skeleton } from "./skeleton";

/**
 * CheckoutSkeleton — loading placeholder for the two-panel checkout/cart
 * layout (form/item list + order summary). Lives in shared/ui so both the
 * checkout widget and the `/checkout` route can use it without a widget→widget
 * lateral import. Server-compatible; used as a <Suspense> fallback.
 */
export function CheckoutSkeleton() {
  return (
    <div
      aria-hidden="true"
      className="flex flex-col gap-8 lg:grid lg:grid-cols-3"
    >
      {/* Form / item list */}
      <div className="flex flex-col gap-4 lg:col-span-2">
        <Skeleton className="h-8 w-48" />
        {Array.from({ length: 3 }).map((_, i) => (
          <div
            key={i}
            className="flex flex-col gap-3 border-b border-border pb-4"
          >
            <Skeleton className="h-5 w-2/3" />
            <div className="flex items-center justify-between">
              <Skeleton className="h-5 w-20" />
              <Skeleton className="h-9 w-28" />
              <Skeleton className="h-5 w-16" />
            </div>
          </div>
        ))}
      </div>

      {/* Summary */}
      <div className="flex flex-col gap-4 rounded-lg border border-border bg-card p-6">
        <Skeleton className="h-6 w-32" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-3/4" />
        <Skeleton className="h-12 w-full" />
      </div>
    </div>
  );
}
