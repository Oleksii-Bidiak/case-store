import { render, screen, within } from "@testing-library/react";
import type { DashboardSummaryResponse } from "@/entities/dashboard";
import { orderStatusLabel } from "@/entities/order";
import { dict } from "@/shared/config";
import { DashboardCharts } from "./DashboardCharts";

// The composition is what is under test here, not recharts: the revenue chart
// is a stub that says what it was handed. The orders-by-status block is plain
// markup since wave 198 (TASK-1037), so it renders for real.
jest.mock("./RevenueTrendChart", () => ({
  RevenueTrendChart: ({ data }: { data: unknown[] }) => (
    <div data-testid="revenue-chart">{data.length}</div>
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

function ordersBlock(): HTMLElement {
  return screen
    .getByRole("heading", { name: dict.dashboard.ordersByStatus })
    .closest("div") as HTMLElement;
}

describe("DashboardCharts — the revenue split (TASK-684)", () => {
  it("renders the revenue trend beside the orders block when the summary carries revenue", () => {
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
    expect(
      screen.getByRole("heading", { name: dict.dashboard.ordersByStatus }),
    ).toBeInTheDocument();
  });

  it("renders no revenue chart when the API withheld revenue, and keeps the orders block", () => {
    // Without `analytics:revenue` the key is absent from the response. An empty
    // revenue chart would read as "the shop sold nothing", which is false.
    render(<DashboardCharts summary={base} />);

    expect(screen.queryByTestId("revenue-chart")).not.toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: dict.dashboard.ordersByStatus }),
    ).toBeInTheDocument();
  });
});

describe("DashboardCharts — «Замовлення за статусом» as bars (TASK-1037)", () => {
  it("lists every status as a row with its Ukrainian name and count, never the raw enum", () => {
    render(
      <DashboardCharts
        summary={{
          ...base,
          orders: {
            ...base.orders,
            ordersByStatus: [
              { status: "DELIVERED", count: 268 },
              { status: "PENDING", count: 3 },
              { status: "CANCELLED", count: 19 },
            ],
          },
        }}
      />,
    );

    const rows = within(ordersBlock()).getAllByRole("listitem");
    expect(rows).toHaveLength(3);
    // Lifecycle order, whatever order the API grouped them in.
    expect(rows[0]).toHaveTextContent(orderStatusLabel("PENDING"));
    expect(rows[0]).toHaveTextContent("3");
    expect(rows[1]).toHaveTextContent(orderStatusLabel("DELIVERED"));
    expect(rows[1]).toHaveTextContent("268");
    expect(rows[2]).toHaveTextContent(orderStatusLabel("CANCELLED"));
    expect(screen.queryByText("PENDING")).not.toBeInTheDocument();
    expect(screen.queryByText("DELIVERED")).not.toBeInTheDocument();
  });

  it("scales each bar against the largest status", () => {
    render(
      <DashboardCharts
        summary={{
          ...base,
          orders: {
            ...base.orders,
            ordersByStatus: [
              { status: "PENDING", count: 50 },
              { status: "DELIVERED", count: 200 },
            ],
          },
        }}
      />,
    );

    const fills = within(ordersBlock())
      .getAllByRole("listitem")
      .map((row) => row.querySelector("[data-slot='bar-fill']") as HTMLElement);
    expect(fills[0].style.width).toBe("25%");
    expect(fills[1].style.width).toBe("100%");
  });

  it("says «Замовлень ще немає.» instead of drawing empty bars", () => {
    render(
      <DashboardCharts
        summary={{ ...base, orders: { ...base.orders, ordersByStatus: [] } }}
      />,
    );

    expect(
      within(ordersBlock()).getByText(dict.dashboard.noLastOrders),
    ).toBeInTheDocument();
    expect(
      within(ordersBlock()).queryByRole("listitem"),
    ).not.toBeInTheDocument();
  });

  it("treats a list of zero counts as empty too", () => {
    render(
      <DashboardCharts
        summary={{
          ...base,
          orders: {
            ...base.orders,
            ordersByStatus: [{ status: "PENDING", count: 0 }],
          },
        }}
      />,
    );

    expect(
      within(ordersBlock()).getByText(dict.dashboard.noLastOrders),
    ).toBeInTheDocument();
  });
});
