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
 */
export function DashboardCharts({ summary }: DashboardChartsProps) {
  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
      <RevenueTrendChart data={summary.revenue.revenueByDay} />
      <OrdersByStatusChart data={summary.orders.ordersByStatus} />
    </div>
  );
}
