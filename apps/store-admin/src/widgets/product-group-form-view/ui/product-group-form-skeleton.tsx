import { Skeleton } from "@/shared/ui";
import { dict } from "@/shared/config";

const g = dict.productGroups;

/**
 * Loading placeholder of the group page (canon 1.7): the back link, a title
 * block, then the real layout — three section cards on the left, the preview
 * and the summary on the right.
 */
export function ProductGroupFormSkeleton() {
  return (
    <div className="flex flex-col gap-4" aria-busy="true">
      <div className="flex flex-col gap-2">
        <span className="text-sm text-muted-foreground">{g.back}</span>
        <Skeleton className="h-8 w-80 max-w-full" />
      </div>
      <div className="grid items-start gap-4 lg:grid-cols-3">
        <div className="flex flex-col gap-4 lg:col-span-2">
          {[2, 3, 4].map((lines) => (
            <div
              key={lines}
              className="flex flex-col gap-3 rounded-lg border bg-card p-4 shadow-card"
            >
              <Skeleton className="h-4 w-32" />
              {Array.from({ length: lines }, (_, index) => (
                <Skeleton key={index} className="h-9 w-full" />
              ))}
            </div>
          ))}
        </div>
        <div className="flex flex-col gap-4">
          <Skeleton className="h-40 w-full rounded-lg" />
          <Skeleton className="h-24 w-full rounded-lg" />
        </div>
      </div>
    </div>
  );
}
