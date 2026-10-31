import { Skeleton } from "@/shared/ui";
import { PRODUCT_GRID_CLASS } from "@/shared/config/product-grid";

/**
 * Loading fallback for the search results column: the «Знайдено N» line and
 * placeholder cards, `gap-6` apart, as in `SearchResultsView`. Without the line
 * (one `text-sm` row, 20px) the cards sat 44px above where the real ones land
 * and dropped by that much on every search (TASK-515, as TASK-869 did for the
 * catalogue).
 */
export function SearchResultsSkeleton() {
  return (
    <div className="flex flex-col gap-6" aria-hidden="true">
      <Skeleton className="h-5 w-40" data-testid="result-count-skeleton" />
      {/* The shared grid of `SearchResultsView` (1 / 2 / 3 / 4 columns). */}
      <div className={PRODUCT_GRID_CLASS}>
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="flex flex-col gap-2">
            <Skeleton className="aspect-square w-full" />
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-4 w-1/3" />
          </div>
        ))}
      </div>
    </div>
  );
}
