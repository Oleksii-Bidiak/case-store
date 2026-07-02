import { Skeleton } from "@/shared/ui";
import type { CatalogView } from "@/features/product-filters";

/** Loading fallback for the product results — grid cards or list rows. */
export function ProductListSkeleton({ view = "grid" }: { view?: CatalogView }) {
  if (view === "list") {
    return (
      <div className="flex flex-col gap-3.5" aria-hidden="true">
        {Array.from({ length: 8 }).map((_, i) => (
          <div
            key={i}
            className="flex gap-5 rounded-2xl border border-border bg-card p-4"
          >
            <Skeleton className="size-[150px] shrink-0 rounded-xl" />
            <div className="flex flex-1 flex-col gap-3 py-1">
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-4 w-1/3" />
              <Skeleton className="mt-auto h-9 w-full" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div
      className="grid gap-[18px] [grid-template-columns:repeat(auto-fill,minmax(232px,1fr))]"
      aria-hidden="true"
    >
      {Array.from({ length: 12 }).map((_, i) => (
        <div key={i} className="flex flex-col gap-2">
          <Skeleton className="aspect-square w-full rounded-xl" />
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-4 w-1/3" />
        </div>
      ))}
    </div>
  );
}
