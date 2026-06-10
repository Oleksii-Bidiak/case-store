import { Skeleton } from "@/shared/ui";

/** Loading fallback for ProductGrid — eight placeholder cards. */
export function ProductGridSkeleton() {
  return (
    <div
      className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4"
      aria-hidden="true"
    >
      {Array.from({ length: 8 }).map((_, i) => (
        <div key={i} className="flex flex-col gap-2">
          <Skeleton className="aspect-square w-full" />
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-4 w-1/3" />
        </div>
      ))}
    </div>
  );
}
