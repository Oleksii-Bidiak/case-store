import { Skeleton } from "@/shared/ui";

/** Placeholder grid, shown while the first page of the library is in flight. */
export function MediaLibrarySkeleton() {
  return (
    <div
      className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5"
      aria-hidden="true"
    >
      {Array.from({ length: 10 }).map((_, index) => (
        <Skeleton key={index} className="aspect-square w-full rounded-lg" />
      ))}
    </div>
  );
}
