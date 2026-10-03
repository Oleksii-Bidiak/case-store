import { Skeleton } from "@/shared/ui";
import { dict } from "@/shared/config";

/**
 * Route-level loading UI for `/settings/search` (TASK-1053, canon 1.7). Without
 * it the segment fell back to the dashboard's loading.tsx — the wrong page's
 * skeleton under the wrong heading. This one keeps the page heading and draws
 * the page's two cards: «Покажчик» and the synonym grid.
 */
export default function Loading() {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h2 className="font-display text-2xl font-semibold tracking-tight text-foreground">
          {dict.searchIndex.heading}
        </h2>
        <p className="text-sm text-muted-foreground">
          {dict.searchIndex.subheading}
        </p>
      </div>

      <div
        data-slot="settings-card-skeleton"
        className="flex flex-col gap-3 rounded-lg border bg-card p-4 shadow-card"
      >
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-4 w-full max-w-120" />
        <Skeleton className="h-4 w-full max-w-100" />
        <Skeleton className="h-9 w-52" />
      </div>

      <div
        data-slot="settings-card-skeleton"
        className="flex flex-col gap-3 rounded-lg border bg-card p-4 shadow-card"
      >
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-9 w-full max-w-90" />
        <div className="grid gap-2 md:grid-cols-2">
          {Array.from({ length: 6 }).map((_, index) => (
            <Skeleton key={index} className="h-10 w-full" />
          ))}
        </div>
      </div>
    </div>
  );
}
