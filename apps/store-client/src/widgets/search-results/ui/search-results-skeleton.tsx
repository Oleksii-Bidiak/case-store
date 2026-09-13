import { Skeleton } from "@/shared/ui";

/** Loading fallback for the search results grid — placeholder cards. */
export function SearchResultsSkeleton() {
  return (
    // Byte-identical to the grid in `SearchResultsView` (1 / 2 / 4 columns).
    <div
      className="grid grid-cols-1 items-stretch gap-6 min-[390px]:grid-cols-2 lg:grid-cols-4"
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
