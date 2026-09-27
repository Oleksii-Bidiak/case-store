"use client";

import type { DashboardSummaryResponse } from "@/entities/dashboard";
import { RevenueTrendChart } from "./RevenueTrendChart";
import { OrdersByStatusChart } from "./OrdersByStatusChart";

interface DashboardChartsProps {
  summary: DashboardSummaryResponse;
}

/**
 * Composes the two dashboard charts side by side on large screens. "use client"
 * so the recharts children stay within a client boundary.
 *
 * TASK-684: `summary.revenue` is absent for a caller without
 * `analytics:revenue` — the API cuts it, this component only follows. No revenue
 * chart is drawn then (an empty one would read as "nothing sold"), and the
 * orders chart takes the full row instead of half of an empty grid.
 */
export function DashboardCharts({ summary }: DashboardChartsProps) {
  const revenue = summary.revenue;

  return (
    <div
      className={`grid grid-cols-1 gap-6${revenue ? " lg:grid-cols-2" : ""}`}
    >
      {revenue ? <RevenueTrendChart data={revenue.revenueByDay} /> : null}
      <OrdersByStatusChart data={summary.orders.ordersByStatus} />
    </div>
  );
}
