import { AdminCategoryTreeSkeleton } from "@/widgets";
import { Skeleton } from "@/shared/ui";
import { dict } from "@/shared/config";

/**
 * Route-level loading UI for `/categories` (canon 1.7, wave 198): the real
 * heading, the toolbar and bulk-bar placeholders, then the tree skeleton — the
 * same frame the page paints, so nothing jumps when it lands.
 */
export default function Loading() {
  return (
    <div className="flex flex-col gap-6" aria-busy="true">
      <div className="flex items-center justify-between gap-4">
        <h2 className="font-display text-2xl font-semibold tracking-tight text-foreground">
          {dict.categories.heading}
        </h2>
        <Skeleton className="h-9 w-40" />
      </div>
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-2 md:flex-row md:items-center">
          <Skeleton className="h-9 w-full md:max-w-xl" />
          <div className="flex items-center gap-2">
            <Skeleton className="h-8 w-32" />
            <Skeleton className="h-8 w-28" />
          </div>
        </div>
        <Skeleton className="h-11 w-full" />
        <AdminCategoryTreeSkeleton />
      </div>
    </div>
  );
}
