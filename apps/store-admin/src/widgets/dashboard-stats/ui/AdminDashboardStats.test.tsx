import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { DashboardSummaryResponse } from "@/entities/dashboard";
import { dict } from "@/shared/config";
import {
  formatCurrency,
  formatPercent,
  formatDurationHours,
} from "@/shared/lib";
import { AdminDashboardStats } from "./AdminDashboardStats";

const summary: DashboardSummaryResponse = {
  revenue: {
    totalRevenue: 48230.75,
    revenueLast30Days: 8120.4,
    unrealizedRevenue: 12400,
    unrealizedRevenueLast30Days: 3800,
    averageOrderValueLast30Days: 812.04,
    revenueByDay: [],
  },
  orders: {
    totalOrders: 312,
    ordersByStatus: [{ status: "PENDING", count: 12 }],
    ordersByDay: [],
  },
  users: { totalUsers: 1045, newUsersByDay: [] },
  customers: { repeatBuyerRate: 0.24, repeatBuyerRateLast90Days: 0.31 },
  products: { totalProducts: 128, activeProducts: 119, topProducts: [] },
  inventory: { lowStockProducts: [] },
  operations: { averageProcessingHoursLast30Days: 36 },
};

/** Strip all whitespace (incl. NBSP/narrow-NBSP from uk-UA grouping). */
const noSpace = (s: string) => s.replace(/[\s  ]/g, "");
/** Whitespace-insensitive text matcher for currency values. */
const money = (value: number) => (content: string) =>
  noSpace(content) === noSpace(formatCurrency(value));
/** Whitespace-insensitive text matcher for percentage values. */
const percent = (value: number) => (content: string) =>
  noSpace(content) === noSpace(formatPercent(value));

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

describe("AdminDashboardStats — metrics v2 (TASK-249)", () => {
  it("renders the AOV and both repeat-buyer cards with formatted values", () => {
    render(<AdminDashboardStats summary={summary} />);

    // Average order value — formatted as currency.
    expect(
      screen.getByText(dict.dashboard.averageOrderValue30),
    ).toBeInTheDocument();
    expect(
      screen.getByText(money(summary.revenue.averageOrderValueLast30Days)),
    ).toBeInTheDocument();

    // Repeat-buyer rate (all-time + 90d) — formatted as a percentage.
    expect(
      screen.getByText(dict.dashboard.repeatBuyerRate),
    ).toBeInTheDocument();
    expect(
      screen.getByText(percent(summary.customers.repeatBuyerRate)),
    ).toBeInTheDocument();
    expect(
      screen.getByText(dict.dashboard.repeatBuyerRate90),
    ).toBeInTheDocument();
    expect(
      screen.getByText(percent(summary.customers.repeatBuyerRateLast90Days)),
    ).toBeInTheDocument();
  });

  it("renders the processing-speed card with its formatted duration (TASK-251)", () => {
    render(<AdminDashboardStats summary={summary} />);

    expect(
      screen.getByText(dict.dashboard.averageProcessingTime),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        formatDurationHours(
          summary.operations.averageProcessingHoursLast30Days,
        ),
      ),
    ).toBeInTheDocument();
  });

  it("reveals a metric explanation when its info trigger is hovered", async () => {
    const user = userEvent.setup();
    render(<AdminDashboardStats summary={summary} />);

    const trigger = screen.getByRole("button", {
      name: dict.dashboard.metricInfoAria(dict.dashboard.averageOrderValue30),
    });

    await user.hover(trigger);

    // Radix renders the copy twice when open (visible tooltip + a visually-hidden
    // a11y duplicate for aria-describedby), so match all and assert at least one.
    const copies = await screen.findAllByText(
      dict.dashboard.averageOrderValue30Tooltip,
    );
    expect(copies.length).toBeGreaterThan(0);
  });

  it("retrofits tooltips onto the two unrealized-revenue cards", () => {
    render(<AdminDashboardStats summary={summary} />);

    expect(
      screen.getByRole("button", {
        name: dict.dashboard.metricInfoAria(dict.dashboard.unrealizedRevenue),
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", {
        name: dict.dashboard.metricInfoAria(dict.dashboard.unrealizedRevenue30),
      }),
    ).toBeInTheDocument();
  });
});
