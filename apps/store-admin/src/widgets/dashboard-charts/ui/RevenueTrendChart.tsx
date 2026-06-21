"use client";

import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { DailyDataPointDto } from "@/entities/dashboard";
import { dict } from "@/shared/config";

interface RevenueTrendChartProps {
  data: DailyDataPointDto[];
}

/** Show only MM-DD from a YYYY-MM-DD string to keep axis ticks readable. */
function shortDate(date: string): string {
  return date.slice(5);
}

/**
 * Line chart of daily revenue over the trailing 30-day window. "use client"
 * because recharts renders to the DOM and must run in the browser.
 */
export function RevenueTrendChart({ data }: RevenueTrendChartProps) {
  return (
    <div className="rounded-lg border border-border bg-card p-6">
      <h3 className="mb-4 text-sm font-medium text-muted-foreground">
        {dict.dashboard.revenueTrend}
      </h3>
      <ResponsiveContainer width="100%" height={240}>
        <LineChart
          data={data}
          margin={{ top: 8, right: 16, bottom: 8, left: 8 }}
        >
          <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
          <XAxis
            dataKey="date"
            tickFormatter={shortDate}
            tick={{ fontSize: 12 }}
            stroke="var(--color-muted-foreground)"
          />
          <YAxis
            tickFormatter={(value: number) => `₴${value.toFixed(0)}`}
            tick={{ fontSize: 12 }}
            stroke="var(--color-muted-foreground)"
            width={56}
          />
          <Tooltip
            formatter={(value) => [
              `₴${Number(value).toFixed(2)}`,
              dict.dashboard.revenueTooltip,
            ]}
            labelFormatter={(label) =>
              `${dict.dashboard.date}: ${String(label)}`
            }
          />
          <Line
            type="monotone"
            dataKey="value"
            stroke="var(--color-primary)"
            strokeWidth={2}
            dot={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
