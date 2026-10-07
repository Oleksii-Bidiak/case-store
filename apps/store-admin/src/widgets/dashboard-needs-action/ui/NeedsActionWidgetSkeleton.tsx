import { cn } from "@/shared/lib";

/** Nine tiles from the needs-action payload (TASK-1090); the tenth is the returns tile. */
const BASE_CARDS = 9;

interface NeedsActionWidgetSkeletonProps {
  /** Whether the session sees the returns tile (`returns:read`, TASK-613). */
  withReturns?: boolean;
}

/**
 * Loading placeholder matching the {@link NeedsActionWidget} layout: the
 * heading line, then the SAME number of cards in the SAME columns — ten in
 * five with the returns tile, nine in three without it (TASK-1090).
 *
 * The count and the column class have to track the widget's, and this one had
 * drifted twice: four cards for six at TASK-446, six for nine at TASK-613. A
 * placeholder of the wrong shape is worse than none — the dashboard visibly
 * reflows under the reader the moment the payload lands (TASK-1037, П3).
 */
export function NeedsActionWidgetSkeleton({
  withReturns = false,
}: NeedsActionWidgetSkeletonProps) {
  const cards = BASE_CARDS + (withReturns ? 1 : 0);
  return (
    <div role="status" aria-busy="true">
      <div className="h-6 w-40 animate-pulse rounded bg-muted motion-reduce:animate-none" />
      <div
        className={cn(
          "mt-4 grid grid-cols-2 gap-4",
          withReturns ? "lg:grid-cols-5" : "lg:grid-cols-3",
        )}
      >
        {Array.from({ length: cards }).map((_, index) => (
          <div
            key={index}
            data-slot="needs-action-skeleton"
            className="rounded-lg border border-border bg-card p-6 shadow-card"
          >
            <div className="h-4 w-28 animate-pulse rounded bg-muted motion-reduce:animate-none" />
            <div className="mt-3 h-8 w-12 animate-pulse rounded bg-muted motion-reduce:animate-none" />
          </div>
        ))}
      </div>
    </div>
  );
}
