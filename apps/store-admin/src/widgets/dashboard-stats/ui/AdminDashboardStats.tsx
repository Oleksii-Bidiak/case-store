import { Info } from "lucide-react";
import type { DashboardSummaryResponse } from "@/entities/dashboard";
import { dict } from "@/shared/config";
import {
  formatCurrency,
  formatPercent,
  formatDurationHours,
} from "@/shared/lib";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/shared/ui";

interface AdminDashboardStatsProps {
  summary: DashboardSummaryResponse;
}

/**
 * Value color carries meaning (design-system §3): `success` (green) for money
 * already earned, `warning` (amber) for money still owed/unrealized, and the
 * neutral default for plain counts. Never used decoratively.
 */
type StatTone = "default" | "success" | "warning";

interface StatCardProps {
  label: string;
  value: string;
  subText: string;
  tone?: StatTone;
  /**
   * Optional plain-UA explanation (TASK-249). When present, an info-icon trigger
   * renders next to the label and reveals this copy on hover/focus.
   */
  tooltip?: string;
}

const TONE_VALUE_CLASS: Record<StatTone, string> = {
  default: "text-foreground",
  success: "text-success",
  warning: "text-warning",
};

function StatCard({
  label,
  value,
  subText,
  tone = "default",
  tooltip,
}: StatCardProps) {
  return (
    <div className="rounded-lg border border-border bg-card p-6 shadow-card">
      <div className="flex items-center gap-1.5">
        <h3 className="text-sm font-medium text-muted-foreground">{label}</h3>
        {tooltip ? (
          <Tooltip>
            <TooltipTrigger
              type="button"
              aria-label={dict.dashboard.metricInfoAria(label)}
              className="inline-flex rounded-sm text-muted-foreground/70 outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background"
            >
              <Info className="size-3.5" aria-hidden="true" />
            </TooltipTrigger>
            <TooltipContent>{tooltip}</TooltipContent>
          </Tooltip>
        ) : null}
      </div>
      <p
        className={`mt-2 font-display text-3xl font-bold tracking-tight tabular-nums ${TONE_VALUE_CLASS[tone]}`}
      >
        {value}
      </p>
      <p className="mt-1 text-xs text-muted-foreground">{subText}</p>
    </div>
  );
}

/**
 * Headline metric cards for the admin dashboard. Pure presentational —
 * receives the already-fetched summary and renders; no hooks, no data fetching.
 * Earned (PAID) revenue is shown separately from unrealized revenue —
 * ordered-but-not-yet-paid money (TASK-137). TASK-249 adds average order value
 * and the two repeat-buyer-rate cards, plus plain-UA tooltips on the new cards
 * and the two unrealized-revenue cards.
 */
export function AdminDashboardStats({ summary }: AdminDashboardStatsProps) {
  const pendingOrders =
    summary.orders.ordersByStatus.find((entry) => entry.status === "PENDING")
      ?.count ?? 0;

  return (
    // TASK-258-H: single column below `sm` — two-up at phone width the
    // text-3xl currency values are unbreakable tokens that force the grid
    // track wider than the viewport (grid min-width:auto) → page-level
    // horizontal scroll.
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      <StatCard
        label={dict.dashboard.totalRevenue}
        value={formatCurrency(summary.revenue.totalRevenue)}
        subText={dict.dashboard.revenueLifetime}
        tone="success"
      />
      <StatCard
        label={dict.dashboard.revenue30}
        value={formatCurrency(summary.revenue.revenueLast30Days)}
        subText={dict.dashboard.last30}
        tone="success"
      />
      <StatCard
        label={dict.dashboard.unrealizedRevenue}
        value={formatCurrency(summary.revenue.unrealizedRevenue)}
        subText={dict.dashboard.unrealizedLifetime}
        tone="warning"
        tooltip={dict.dashboard.unrealizedRevenueTooltip}
      />
      <StatCard
        label={dict.dashboard.unrealizedRevenue30}
        value={formatCurrency(summary.revenue.unrealizedRevenueLast30Days)}
        subText={dict.dashboard.last30}
        tone="warning"
        tooltip={dict.dashboard.unrealizedRevenue30Tooltip}
      />
      <StatCard
        label={dict.dashboard.averageOrderValue30}
        value={formatCurrency(summary.revenue.averageOrderValueLast30Days)}
        subText={dict.dashboard.averageOrderValue30Sub}
        tooltip={dict.dashboard.averageOrderValue30Tooltip}
      />
      <StatCard
        label={dict.dashboard.totalOrders}
        value={String(summary.orders.totalOrders)}
        subText={dict.dashboard.awaitingFulfilment(pendingOrders)}
      />
      <StatCard
        label={dict.dashboard.totalUsers}
        value={String(summary.users.totalUsers)}
        subText={dict.dashboard.registeredCustomers}
      />
      <StatCard
        label={dict.dashboard.repeatBuyerRate}
        value={formatPercent(summary.customers.repeatBuyerRate)}
        subText={dict.dashboard.repeatBuyerRateSub}
        tooltip={dict.dashboard.repeatBuyerRateTooltip}
      />
      <StatCard
        label={dict.dashboard.repeatBuyerRate90}
        value={formatPercent(summary.customers.repeatBuyerRateLast90Days)}
        subText={dict.dashboard.repeatBuyerRate90Sub}
        tooltip={dict.dashboard.repeatBuyerRate90Tooltip}
      />
      {/* TASK-251: processing-speed — an operational-efficiency signal, grouped
          with the other recent-behaviour cards. */}
      <StatCard
        label={dict.dashboard.averageProcessingTime}
        value={formatDurationHours(
          summary.operations.averageProcessingHoursLast30Days,
        )}
        subText={dict.dashboard.averageProcessingTimeSub}
        tooltip={dict.dashboard.averageProcessingTimeTooltip}
      />
    </div>
  );
}
