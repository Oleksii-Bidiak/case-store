import type { DashboardSummaryResponse } from "@/entities/dashboard";
import { dict } from "@/shared/config";
import { formatCurrency } from "@/shared/lib";

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
}

const TONE_VALUE_CLASS: Record<StatTone, string> = {
  default: "text-foreground",
  success: "text-success",
  warning: "text-warning",
};

function StatCard({ label, value, subText, tone = "default" }: StatCardProps) {
  return (
    <div className="rounded-lg border border-border bg-card p-6 shadow-card">
      <h3 className="text-sm font-medium text-muted-foreground">{label}</h3>
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
 * ordered-but-not-yet-paid money (TASK-137).
 */
export function AdminDashboardStats({ summary }: AdminDashboardStatsProps) {
  const pendingOrders =
    summary.orders.ordersByStatus.find((entry) => entry.status === "PENDING")
      ?.count ?? 0;

  return (
    <div className="grid grid-cols-2 gap-4 lg:grid-cols-3">
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
      />
      <StatCard
        label={dict.dashboard.unrealizedRevenue30}
        value={formatCurrency(summary.revenue.unrealizedRevenueLast30Days)}
        subText={dict.dashboard.last30}
        tone="warning"
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
    </div>
  );
}
