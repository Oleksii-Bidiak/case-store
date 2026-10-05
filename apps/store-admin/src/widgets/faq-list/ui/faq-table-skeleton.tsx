import { Skeleton } from "@/shared/ui";
import { dict } from "@/shared/config";

const SKELETON_ROWS = 6;

/**
 * Loading placeholder for `/faq` (канон 1.7): the real heading, the views and
 * the search as blocks, then accordion rows shaped like the real ones —
 * a grip, the question and the first line of the answer, the status.
 *
 * `withChrome={false}` is the in-widget variant: only the rows are loading.
 */
export function AdminFaqTableSkeleton({
  withChrome = true,
}: {
  withChrome?: boolean;
}) {
  return (
    <div className="flex flex-col gap-4" aria-busy="true">
      {withChrome ? (
        <>
          <div className="flex items-start justify-between gap-3">
            <div className="flex flex-col gap-1">
              <h2 className="font-display text-2xl font-semibold tracking-tight text-foreground">
                {dict.faq.heading}
              </h2>
              <Skeleton className="h-4 w-80 max-w-full" />
            </div>
            <Skeleton className="h-9 w-44" />
          </div>
          <div className="flex gap-2">
            {Array.from({ length: 3 }, (_, index) => (
              <Skeleton key={index} className="h-8 w-28 rounded-full" />
            ))}
          </div>
          <Skeleton className="h-10 w-full md:max-w-150" />
        </>
      ) : null}
      <ul className="divide-y overflow-hidden rounded-lg border shadow-card">
        {Array.from({ length: SKELETON_ROWS }, (_, index) => (
          <li key={index} className="flex items-start gap-3 px-3 py-3.5">
            <Skeleton className="mt-0.5 size-4 shrink-0" />
            <div className="flex min-w-0 flex-1 flex-col gap-2">
              <Skeleton className="h-4 w-2/5" />
              <Skeleton className="h-3.5 w-4/5" />
            </div>
            <Skeleton className="hidden h-5 w-24 rounded-full md:block" />
          </li>
        ))}
      </ul>
    </div>
  );
}
