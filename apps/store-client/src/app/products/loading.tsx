import { ProductListSkeleton } from "@/widgets";
import { Skeleton } from "@/shared/ui";

/**
 * Route-level loading UI for `/products`. Fires on navigation before the page
 * component instantiates, so it stands in for the WHOLE page — breadcrumb,
 * title and catalogue shell — not just the results. The container repeats the
 * one in `page.tsx` (same max width, same paddings) and the skeleton is the
 * `withSidebar` variant, so the placeholder does not sit 40px narrower than the
 * page and then jump left by a whole filter column (TASK-416).
 */
export default function Loading() {
  return (
    // eslint-disable-next-line tailwindcss/no-arbitrary-value -- repeats the catalogue container width in products/page.tsx; drift here shifts the whole page sideways
    <div className="mx-auto w-full max-w-[1320px] px-4 py-6 sm:px-6 sm:py-8">
      {/* Breadcrumb row. */}
      <Skeleton className="mb-3.5 h-5 w-64 max-w-full" aria-hidden="true" />

      {/* Page title + subtitle. */}
      <div className="mb-4 flex flex-col gap-2" aria-hidden="true">
        <Skeleton className="h-8 w-72 max-w-full" />
        <Skeleton className="h-5 w-full max-w-2xl" />
      </div>

      <ProductListSkeleton withSidebar />
    </div>
  );
}
