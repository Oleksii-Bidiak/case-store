import { Skeleton } from "@/shared/ui";
import { dict } from "@/shared/config";

const ROWS = 6;

/**
 * Loading placeholder in the shape of «Головна» (canon 1.7): the heading and its
 * line, then the block rows — icon tile, two text lines, the switch — and the page
 * schema beside them from `lg`. `withHeading={false}` when the real header is
 * already on screen.
 */
export function HomeBlockListSkeleton({
  withHeading = true,
}: {
  withHeading?: boolean;
}) {
  return (
    <div className="flex flex-col gap-6" aria-busy="true">
      {withHeading && (
        <div className="flex flex-col gap-1">
          <h2 className="font-display text-2xl font-semibold tracking-tight text-foreground">
            {dict.homeScreen.heading}
          </h2>
          <Skeleton className="h-4 w-full max-w-lg" />
        </div>
      )}
      <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
        <div className="flex-1 overflow-hidden rounded-lg border border-border bg-card">
          {Array.from({ length: ROWS }).map((_, row) => (
            <div
              key={row}
              className="flex items-center gap-3 border-t border-border px-3 py-3 first:border-t-0"
            >
              <Skeleton className="size-9 rounded-md" />
              <div className="flex flex-1 flex-col gap-1.5">
                <Skeleton className="h-4 w-1/3" />
                <Skeleton className="h-3 w-1/2" />
              </div>
              <Skeleton className="h-5 w-9 rounded-full" />
            </div>
          ))}
        </div>
        <Skeleton className="hidden h-96 w-65 shrink-0 rounded-lg lg:block" />
      </div>
    </div>
  );
}
