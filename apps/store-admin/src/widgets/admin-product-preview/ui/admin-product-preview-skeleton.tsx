import { Skeleton } from "@/shared/ui";
import { dict } from "@/shared/config";
import { OverviewBreadcrumb } from "./overview-breadcrumb";

/**
 * Loading placeholder in the overview's own layout (ProductPreviewProposal ПП8,
 * canon 1.7): the breadcrumb, the title, the photo and the facts on the left,
 * three cards on the right.
 */
export function AdminProductPreviewSkeleton() {
  return (
    <div className="flex max-w-300 flex-col gap-4" aria-busy="true">
      <span role="status" className="sr-only">
        {dict.common.loading}
      </span>
      <OverviewBreadcrumb href="/products" />
      <Skeleton className="h-8 w-full max-w-2xl" />
      <Skeleton className="h-4 w-64" />
      <div className="flex flex-col gap-6 lg:grid lg:grid-cols-5 lg:items-start">
        <div className="flex flex-col gap-4 lg:col-span-3">
          <Skeleton className="h-80 w-full rounded-lg" />
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-28 w-full rounded-lg" />
        </div>
        <div className="flex flex-col gap-4 lg:col-span-2">
          <Skeleton className="h-44 w-full rounded-lg" />
          <Skeleton className="h-32 w-full rounded-lg" />
          <Skeleton className="h-40 w-full rounded-lg" />
        </div>
      </div>
    </div>
  );
}
