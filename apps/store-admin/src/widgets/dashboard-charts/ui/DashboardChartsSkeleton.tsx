import { cn } from "@/shared/lib";

interface DashboardChartsSkeletonProps {
  /**
   * Whether the revenue chart will be drawn (TASK-684) — two cards side by side
   * on `lg` with it, the orders card alone across the row without it.
   */
  withRevenue?: boolean;
}

/**
 * Loading placeholder for {@link DashboardCharts} (TASK-1037, П3): the same
 * grid, the same card, a heading bar and a 240 px plot area — the height both
 * loaded cards have — so nothing moves when the summary lands.
 */
export function DashboardChartsSkeleton({
  withRevenue = true,
}: DashboardChartsSkeletonProps) {
  return (
    <div
      role="status"
      aria-busy="true"
      className={cn("grid grid-cols-1 gap-6", withRevenue && "lg:grid-cols-2")}
    >
      {Array.from({ length: withRevenue ? 2 : 1 }).map((_, index) => (
        <div
          key={index}
          data-slot="chart-skeleton"
          className="rounded-lg border border-border bg-card p-6 shadow-card"
        >
          <div className="h-4 w-36 animate-pulse rounded bg-muted motion-reduce:animate-none" />
          <div className="mt-4 h-60 animate-pulse rounded bg-muted motion-reduce:animate-none" />
        </div>
      ))}
    </div>
  );
}
