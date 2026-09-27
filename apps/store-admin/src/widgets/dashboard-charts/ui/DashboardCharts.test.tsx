import { render, screen } from "@testing-library/react";
import type { DashboardSummaryResponse } from "@/entities/dashboard";
import { DashboardCharts } from "./DashboardCharts";

// The composition is what is under test here, not recharts: each chart is a
// stub that says which one it is and what it was handed.
jest.mock("./RevenueTrendChart", () => ({
  RevenueTrendChart: ({ data }: { data: unknown[] }) => (
    <div data-testid="revenue-chart">{data.length}</div>
  ),
}));
jest.mock("./OrdersByStatusChart", () => ({
  OrdersByStatusChart: ({ data }: { data: unknown[] }) => (
    <div data-testid="orders-chart">{data.length}</div>
  ),
}));

const base: Omit<DashboardSummaryResponse, "revenue"> = {
  orders: {
    totalOrders: 3,
    ordersByStatus: [{ status: "PENDING", count: 3 }],
    ordersByDay: [],
  },
  users: { totalUsers: 1, newUsersByDay: [] },
  customers: { repeatBuyerRate: 0, repeatBuyerRateLast90Days: 0 },
  products: { totalProducts: 0, activeProducts: 0, topProducts: [] },
  inventory: { lowStockProducts: [] },
  operations: { averageProcessingHoursLast30Days: 0 },
};

describe("DashboardCharts — the revenue split (TASK-684)", () => {
  it("renders the revenue trend beside the orders chart when the summary carries revenue", () => {
    render(
      <DashboardCharts
        summary={{
          ...base,
          revenue: {
            totalRevenue: 10,
            revenueLast30Days: 10,
            unrealizedRevenue: 0,
            unrealizedRevenueLast30Days: 0,
            averageOrderValueLast30Days: 10,
            revenueByDay: [{ date: "2026-09-26", value: 10 }],
          },
        }}
      />,
    );

    expect(screen.getByTestId("revenue-chart")).toHaveTextContent("1");
    expect(screen.getByTestId("orders-chart")).toBeInTheDocument();
  });

  it("renders no revenue chart when the API withheld revenue, and keeps the orders chart", () => {
    // Without `analytics:revenue` the key is absent from the response. An empty
    // revenue chart would read as "the shop sold nothing", which is false.
    render(<DashboardCharts summary={base} />);

    expect(screen.queryByTestId("revenue-chart")).not.toBeInTheDocument();
    expect(screen.getByTestId("orders-chart")).toBeInTheDocument();
  });
});
