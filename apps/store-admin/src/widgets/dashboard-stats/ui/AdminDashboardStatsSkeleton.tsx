const SKELETON_CARDS = 4;

/**
 * Loading placeholder matching the four-card AdminDashboardStats layout.
 */
export function AdminDashboardStatsSkeleton() {
  return (
    // Mirrors AdminDashboardStats' mobile collapse (TASK-258-H): 1 col < sm.
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {Array.from({ length: SKELETON_CARDS }).map((_, index) => (
        <div
          key={index}
          className="rounded-lg border border-border bg-card p-6 shadow-card"
        >
          <div className="h-4 w-24 animate-pulse rounded bg-muted" />
          <div className="mt-3 h-8 w-20 animate-pulse rounded bg-muted" />
          <div className="mt-2 h-3 w-28 animate-pulse rounded bg-muted" />
        </div>
      ))}
    </div>
  );
}
