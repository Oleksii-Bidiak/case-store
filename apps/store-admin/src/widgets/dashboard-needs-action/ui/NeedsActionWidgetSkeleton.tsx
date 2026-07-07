const SKELETON_CARDS = 4;

/**
 * Loading placeholder matching the four-card {@link NeedsActionWidget} layout
 * (same visual language as AdminDashboardStatsSkeleton).
 */
export function NeedsActionWidgetSkeleton() {
  return (
    <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
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
