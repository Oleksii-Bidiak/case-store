"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { OrderStatusCountDto } from "@/entities/dashboard";
import { dict } from "@/shared/config";

interface OrdersByStatusChartProps {
  data: OrderStatusCountDto[];
}

/**
 * Bar chart of order counts grouped by status. "use client" because recharts
 * renders to the DOM and must run in the browser.
 */
export function OrdersByStatusChart({ data }: OrdersByStatusChartProps) {
  return (
    <div className="rounded-lg border border-border bg-card p-6">
      <h3 className="mb-4 text-sm font-medium text-muted-foreground">
        {dict.dashboard.ordersByStatus}
      </h3>
      <ResponsiveContainer width="100%" height={240}>
        <BarChart
          data={data}
          margin={{ top: 8, right: 16, bottom: 8, left: 8 }}
        >
          <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
          <XAxis
            dataKey="status"
            tick={{ fontSize: 11 }}
            stroke="var(--color-muted-foreground)"
            interval={0}
            angle={-30}
            textAnchor="end"
            height={56}
          />
          <YAxis
            allowDecimals={false}
            tick={{ fontSize: 12 }}
            stroke="var(--color-muted-foreground)"
            width={40}
          />
          <Tooltip
            formatter={(value) => [String(value), dict.dashboard.ordersTooltip]}
          />
          <Bar
            dataKey="count"
            fill="var(--color-primary)"
            radius={[4, 4, 0, 0]}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
