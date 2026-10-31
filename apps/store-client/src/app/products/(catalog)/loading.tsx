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
 *
 * It lives in the `(catalog)` route group — URL unchanged — so it wraps the
 * listing ONLY (TASK-832). At `app/products/loading.tsx` it was an ancestor of
 * `/products/[slug]` too, and Next prefetches a dynamic route "layout to first
 * loading boundary": the shell cached for every product link was this
 * catalogue grid, which is what flashed before a PDP. Do not move it back up.
 */
export default function Loading() {
  return (
    <div className={`${PAGE_CONTAINER} py-6 sm:py-8`}>
      {/* The head as `CatalogHead` draws it (Catalog §3): the 44px back pill
          below md (`mb-1`), the breadcrumb row from md (`mb-3.5`), then the
          h1's line box (H1_CLASS: 36px, 40px from md). The count line under
          it is the listing skeleton's own. */}
      <div aria-hidden="true">
        <div className="mb-1 flex h-11 items-center md:hidden">
          <Skeleton className="h-4 w-24" />
        </div>
        <Skeleton className="mb-3.5 hidden h-5 w-64 max-w-full md:block" />
        <Skeleton className="h-9 w-72 max-w-full md:h-10" />
      </div>

      <ProductListSkeleton withSidebar />
    </div>
  );
}
