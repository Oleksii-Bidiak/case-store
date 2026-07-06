interface DashboardSectionSkeletonProps {
  /** Number of placeholder rows inside the section box. */
  rows?: number;
  /** Minimum height so the placeholder matches the loaded section's footprint. */
  className?: string;
}

/**
 * DashboardSectionSkeleton — reusable placeholder for a dashboard section
 * (charts, top-products, low-stock). Renders a bordered box with a heading
 * line and a few animate-pulse rows so the dashboard keeps its shape during
 * `isLoading` instead of collapsing and jumping when data arrives.
 */
export function DashboardSectionSkeleton({
  rows = 4,
  className = "min-h-[200px]",
}: DashboardSectionSkeletonProps) {
  return (
    <div
      role="status"
      aria-busy="true"
      className={`flex flex-col gap-3 rounded-lg border border-border bg-card p-6 shadow-card ${className}`}
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
