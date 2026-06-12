import type { DashboardSummaryResponse } from "@/entities/dashboard";

interface AdminDashboardStatsProps {
  summary: DashboardSummaryResponse;
}

const currencyFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
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
        label="Total Revenue"
        value={currencyFormatter.format(summary.revenue.totalRevenue)}
        subText="Lifetime (excl. cancelled / refunded)"
      />
      <StatCard
        label="Revenue (30 days)"
        value={currencyFormatter.format(summary.revenue.revenueLast30Days)}
        subText="Last 30 days"
      />
      <StatCard
        label="Total Orders"
        value={String(summary.orders.totalOrders)}
        subText={`${pendingOrders} awaiting fulfilment`}
      />
      <StatCard
        label="Total Users"
        value={String(summary.users.totalUsers)}
        subText="Registered customers"
      />
    </div>
  );
}
