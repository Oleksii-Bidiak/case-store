import type { DashboardSummaryResponse } from "@/entities/dashboard";
import { dict } from "@/shared/config";

interface AdminDashboardStatsProps {
  summary: DashboardSummaryResponse;
}

const currencyFormatter = new Intl.NumberFormat("uk-UA", {
  style: "currency",
  currency: "UAH",
  maximumFractionDigits: 0,
});

interface StatCardProps {
  label: string;
  value: string;
  subText: string;
}

function StatCard({ label, value, subText }: StatCardProps) {
  return (
    <div className="rounded-lg border border-border bg-card p-6">
      <h3 className="text-sm font-medium text-muted-foreground">{label}</h3>
      <p className="mt-2 text-3xl font-bold text-foreground">{value}</p>
      <p className="mt-1 text-xs text-muted-foreground">{subText}</p>
    </div>
  );
}

/**
 * Four headline metric cards for the admin dashboard. Pure presentational —
 * receives the already-fetched summary and renders; no hooks, no data fetching.
 */
export function AdminDashboardStats({ summary }: AdminDashboardStatsProps) {
  const pendingOrders =
    summary.orders.ordersByStatus.find((entry) => entry.status === "PENDING")
      ?.count ?? 0;

  return (
    <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
      <StatCard
        label={dict.dashboard.totalRevenue}
        value={currencyFormatter.format(summary.revenue.totalRevenue)}
        subText={dict.dashboard.revenueLifetime}
      />
      <StatCard
        label={dict.dashboard.revenue30}
        value={currencyFormatter.format(summary.revenue.revenueLast30Days)}
        subText={dict.dashboard.last30}
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
