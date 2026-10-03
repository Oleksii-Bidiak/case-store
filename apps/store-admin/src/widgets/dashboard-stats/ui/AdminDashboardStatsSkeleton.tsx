/** Five money tiles (TASK-684) + five operational ones — see AdminDashboardStats. */
const MONEY_CARDS = 5;
const OPERATIONAL_CARDS = 5;

interface AdminDashboardStatsSkeletonProps {
  /** Whether the session will see the money tiles (`analytics:revenue`). */
  withRevenue?: boolean;
}

/**
 * Loading placeholder matching the AdminDashboardStats layout (TASK-1037, П3):
 * the same three-column grid and the same number of cards the page will draw —
 * ten with money, five without. It used to draw four cards in four columns for a
 * page of ten in three, so the whole dashboard reflowed when the summary landed.
 */
export function AdminDashboardStatsSkeleton({
  withRevenue = true,
}: AdminDashboardStatsSkeletonProps) {
  const cards = OPERATIONAL_CARDS + (withRevenue ? MONEY_CARDS : 0);
  return (
    // Mirrors AdminDashboardStats' mobile collapse (TASK-258-H): 1 col < sm.
    <div
      role="status"
      aria-busy="true"
      className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3"
    >
      {Array.from({ length: cards }).map((_, index) => (
        <div
          key={index}
          data-slot="stat-skeleton"
          className="rounded-lg border border-border bg-card p-6 shadow-card"
        >
          <div className="h-4 w-24 animate-pulse rounded bg-muted motion-reduce:animate-none" />
          <div className="mt-3 h-8 w-28 animate-pulse rounded bg-muted motion-reduce:animate-none" />
          <div className="mt-2 h-3 w-36 animate-pulse rounded bg-muted motion-reduce:animate-none" />
        </div>
      ))}
    </div>
  );
}
