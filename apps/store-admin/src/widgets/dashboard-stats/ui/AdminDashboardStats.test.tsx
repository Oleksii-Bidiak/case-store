import { render, screen } from "@testing-library/react";
import type { DashboardSummaryResponse } from "@/entities/dashboard";
import { dict } from "@/shared/config";
import { formatCurrency } from "@/shared/lib";
import { AdminDashboardStats } from "./AdminDashboardStats";

const summary: DashboardSummaryResponse = {
  revenue: {
    totalRevenue: 48230.75,
    revenueLast30Days: 8120.4,
    unrealizedRevenue: 12400,
    unrealizedRevenueLast30Days: 3800,
    revenueByDay: [],
  },
  orders: {
    totalOrders: 312,
    ordersByStatus: [{ status: "PENDING", count: 12 }],
    ordersByDay: [],
  },
  users: { totalUsers: 1045, newUsersByDay: [] },
  products: { totalProducts: 128, activeProducts: 119, topProducts: [] },
  inventory: { lowStockProducts: [] },
};

/** Strip all whitespace (incl. NBSP/narrow-NBSP from uk-UA grouping). */
const noSpace = (s: string) => s.replace(/[\s  ]/g, "");
/** Whitespace-insensitive text matcher for currency values. */
const money = (value: number) => (content: string) =>
  noSpace(content) === noSpace(formatCurrency(value));

describe("AdminDashboardStats (TASK-137)", () => {
  it("shows earned revenue separately from unrealized (ordered-but-unpaid) revenue", () => {
    render(<AdminDashboardStats summary={summary} />);

    expect(screen.getByText(dict.dashboard.totalRevenue)).toBeInTheDocument();
    expect(
      screen.getByText(money(summary.revenue.totalRevenue)),
    ).toBeInTheDocument();

    expect(
      screen.getByText(dict.dashboard.unrealizedRevenue),
    ).toBeInTheDocument();
    expect(
      screen.getByText(money(summary.revenue.unrealizedRevenue)),
    ).toBeInTheDocument();
    expect(
      screen.getByText(dict.dashboard.unrealizedRevenue30),
    ).toBeInTheDocument();
  });
});
