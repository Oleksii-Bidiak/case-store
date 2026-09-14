const SKELETON_CARDS = 6;

/**
 * Loading placeholder matching the {@link NeedsActionWidget} layout (same visual
 * language as AdminDashboardStatsSkeleton).
 *
 * The count and the column class have to track the widget's, and this one had
 * already drifted: the widget grew to five cards at TASK-251 and six at
 * TASK-446 while the skeleton still drew four in four columns. A placeholder
 * that is the wrong shape is worse than none — the dashboard visibly reflows
 * under the reader the moment the payload lands.
 */
export function NeedsActionWidgetSkeleton() {
  return (
    <div className="grid grid-cols-2 gap-4 lg:grid-cols-3">
      {Array.from({ length: SKELETON_CARDS }).map((_, index) => (
        <div
          key={index}
          className="rounded-lg border border-border bg-card p-6 shadow-card"
        >
          <div className="h-4 w-28 animate-pulse rounded bg-muted" />
          <div className="mt-3 h-8 w-12 animate-pulse rounded bg-muted" />
        </div>
      ))}
    </div>
  );
}
