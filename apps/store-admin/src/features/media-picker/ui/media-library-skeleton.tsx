import { Skeleton } from "@/shared/ui";
import { cn } from "@/shared/lib/utils";

/**
 * Placeholder grid, shown while the first page of the library is in flight.
 *
 * Card-shaped (wave 198, МТ11): the square plus the two caption lines a real
 * card has, so nothing jumps when the cards land. `layout` mirrors the grid's —
 * the picker dialog counts columns by its own width.
 */
export function MediaLibrarySkeleton({
  layout = "page",
  count = 10,
}: {
  layout?: "page" | "dialog";
  count?: number;
}) {
  return (
    <div className={cn(layout === "dialog" && "@container")} aria-hidden="true">
      <div
        className={cn(
          "grid grid-cols-2 gap-3",
          layout === "dialog"
            ? "@md:grid-cols-3 @2xl:grid-cols-4"
            : "sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5",
        )}
      >
        {Array.from({ length: count }).map((_, index) => (
          <div
            key={index}
            data-slot="media-card-skeleton"
            className="flex flex-col gap-2"
          >
            <Skeleton className="aspect-square w-full rounded-lg" />
            <Skeleton className="h-3 w-4/5" />
            <Skeleton className="h-3 w-1/2" />
          </div>
        ))}
      </div>
    </div>
  );
}
