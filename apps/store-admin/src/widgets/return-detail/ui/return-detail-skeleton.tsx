import { Skeleton } from "@/shared/ui";
import { dict } from "@/shared/config";

/**
 * Loading placeholder shaped like the card (ReturnsProposal Р3): the header,
 * the steps, then the goods beside «Наступний крок».
 */
export function ReturnDetailSkeleton() {
  return (
    <div className="flex flex-col gap-6" aria-busy="true">
      <span role="status" className="sr-only">
        {dict.common.loading}
      </span>
      <div className="flex flex-col gap-2" aria-hidden="true">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-5 w-80 max-w-full" />
      </div>
      <Skeleton aria-hidden="true" className="h-16 w-full rounded-lg" />
      <div aria-hidden="true" className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="flex flex-col gap-6 lg:col-start-3 lg:row-start-1">
          <Skeleton className="h-48 w-full rounded-lg" />
          <Skeleton className="h-24 w-full rounded-lg" />
        </div>
        <div className="flex flex-col gap-6 lg:col-span-2 lg:col-start-1 lg:row-start-1">
          <Skeleton className="h-24 w-full rounded-lg" />
          <Skeleton className="h-56 w-full rounded-lg" />
        </div>
      </div>
    </div>
  );
}
