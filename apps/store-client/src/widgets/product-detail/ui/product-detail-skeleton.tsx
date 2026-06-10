import { Skeleton } from "@/shared/ui";

/**
 * ProductDetailSkeleton — loading placeholder for the product detail page.
 * Mirrors the two-column layout of ProductDetailView (gallery + info panel).
 * Server-compatible (no client interactivity); used as a <Suspense> fallback.
 */
export function ProductDetailSkeleton() {
  return (
    <div
      aria-hidden="true"
      className="flex flex-col gap-8 md:grid md:grid-cols-2"
    >
      {/* Left: image gallery */}
      <div className="flex flex-col gap-4">
        <Skeleton className="aspect-square w-full" />
        <div className="flex gap-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="size-16 shrink-0" />
          ))}
        </div>
      </div>

      {/* Right: product info */}
      <div className="flex flex-col gap-6">
        <Skeleton className="h-8 w-3/4" />
        <Skeleton className="h-6 w-28" />
        <div className="flex flex-col gap-2">
          <Skeleton className="h-4 w-32" />
          <div className="flex gap-2">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-10 w-24" />
            ))}
          </div>
        </div>
        <div className="flex flex-col gap-2">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-2/3" />
        </div>
        <Skeleton className="h-12 w-full" />
      </div>
    </div>
  );
}
