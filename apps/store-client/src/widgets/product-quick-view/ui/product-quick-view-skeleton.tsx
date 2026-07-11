import { Skeleton } from "@/shared/ui";

/**
 * ProductQuickViewSkeleton — condensed loading state for the quick-view dialog
 * body while `useProductControllerFindBySlug` resolves the full gallery. Mirrors
 * `ProductDetailSkeleton`'s block-for-block philosophy at the dialog's narrower
 * footprint: one square image placeholder plus a handful of text rows — no
 * tabs/related section, since quick-view has neither. The dialog's title and
 * close button live outside this body, so screen-reader users still get a named
 * dialog immediately.
 */
export function ProductQuickViewSkeleton() {
  return (
    <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
      <Skeleton className="aspect-square w-full rounded-xl" />
      <div className="flex flex-col gap-4">
        <Skeleton className="h-7 w-3/4 rounded-md" />
        <Skeleton className="h-4 w-1/3 rounded-md" />
        <Skeleton className="h-4 w-1/4 rounded-md" />
        <Skeleton className="h-9 w-1/2 rounded-md" />
        <Skeleton className="h-5 w-1/3 rounded-md" />
        <div className="mt-2 flex flex-col gap-2.5">
          <Skeleton className="h-11 w-full rounded-lg" />
          <Skeleton className="h-11 w-full rounded-lg" />
        </div>
      </div>
    </div>
  );
}
