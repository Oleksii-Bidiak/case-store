import { ProductListSkeleton } from "@/widgets";
import { Skeleton } from "@/shared/ui";
import { PAGE_CONTAINER } from "@/shared/config";

/**
 * Route-level loading UI for `/products`. Fires on navigation before the page
 * component instantiates, so it stands in for the WHOLE page — breadcrumb,
 * title and catalogue shell — not just the results. Both use the shared
 * `PAGE_CONTAINER` (same max width, same gutter) and the skeleton is the
 * `withSidebar` variant, so the placeholder does not sit 40px narrower than the
 * page and then jump left by a whole filter column (TASK-416).
 */
export default function Loading() {
  return (
    <div className={`${PAGE_CONTAINER} py-6 sm:py-8`}>
      {/* Breadcrumb row. */}
      <Skeleton className="mb-3.5 h-5 w-64 max-w-full" aria-hidden="true" />

      {/* Page title + subtitle — the h1's line box (H1_CLASS: 36px, 40px from
          md), the subtitle's 20px lines (two on a phone, where it wraps, one
          from sm) and the block's 18px bottom margin, so the chips row and the
          grid below start where the page's own do (TASK-515). */}
      <div className="mb-4.5 flex flex-col gap-2" aria-hidden="true">
        <Skeleton className="h-9 w-72 max-w-full md:h-10" />
        <div className="flex max-w-2xl flex-col gap-1 py-0.5">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-2/3 sm:hidden" />
        </div>
      </div>

      <ProductListSkeleton withSidebar />
    </div>
  );
}
