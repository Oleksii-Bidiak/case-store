import { Skeleton } from "@/shared/ui";

/** Loading fallback for the PopularRail — a row of placeholder cards. */
export function PopularRailSkeleton() {
  return (
    <div className="flex gap-5 overflow-hidden pb-3" aria-hidden="true">
      {Array.from({ length: 5 }).map((_, i) => (
        <div
          key={i}
          className="flex w-[244px] shrink-0 flex-col gap-2 sm:w-[260px]"
        >
          <Skeleton className="aspect-square w-full rounded-xl" />
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-4 w-1/3" />
        </div>
      ))}
    </div>
  );
}
