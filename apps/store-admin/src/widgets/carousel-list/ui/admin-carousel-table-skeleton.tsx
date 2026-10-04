import { Skeleton } from "@/shared/ui";
import { dict } from "@/shared/config";

const SECTIONS = 2;
const ROWS = 2;

/**
 * Loading placeholder in the shape of the carousel list (canon 1.7): the page
 * heading, the search row, then placement sections of carousel rows.
 * `withHeading={false}` when the real header is already on screen.
 */
export function AdminCarouselTableSkeleton({
  withHeading = true,
}: {
  withHeading?: boolean;
}) {
  return (
    <div className="flex flex-col gap-6" aria-busy="true">
      {withHeading && (
        <>
          <h2 className="font-display text-2xl font-semibold tracking-tight text-foreground">
            {dict.carousels.heading}
          </h2>
          <Skeleton className="h-9 w-full max-w-md" />
        </>
      )}
      {Array.from({ length: SECTIONS }).map((_, section) => (
        <div key={section} className="flex flex-col gap-2">
          <Skeleton className="h-5 w-56" />
          <Skeleton className="h-3 w-72 max-w-full" />
          <div className="overflow-hidden rounded-lg border border-border bg-card">
            {Array.from({ length: ROWS }).map((__, row) => (
              <div
                key={row}
                className="flex items-center gap-3 border-t border-border px-3 py-3 first:border-t-0"
              >
                <Skeleton className="size-4" />
                <div className="flex flex-1 flex-col gap-1.5">
                  <Skeleton className="h-4 w-1/2" />
                  <Skeleton className="h-3 w-1/3" />
                </div>
                <Skeleton className="hidden h-4 w-28 md:block" />
                <Skeleton className="hidden h-5 w-24 rounded-full md:block" />
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
