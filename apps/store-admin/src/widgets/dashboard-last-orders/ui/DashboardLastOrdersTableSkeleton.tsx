/**
 * Loading placeholder for {@link DashboardLastOrdersTable}. Self-contained
 * (no cross-widget import) — mirrors the card wrapper + heading + row shape of
 * the loaded table so the dashboard keeps its footprint during `isLoading`
 * instead of jumping when the 5 rows arrive.
 */
export function DashboardLastOrdersTableSkeleton({
  rows = 5,
}: {
  rows?: number;
}) {
  return (
    <div
      role="status"
      aria-busy="true"
      className="flex flex-col gap-3 rounded-lg border border-border bg-card p-6 shadow-card"
    >
      <div className="h-5 w-40 animate-pulse rounded bg-muted" />
      {Array.from({ length: rows }).map((_, index) => (
        <div
          key={index}
          className="h-4 w-full animate-pulse rounded bg-muted"
        />
      ))}
    </div>
  );
}
