import { render, screen, within } from "@testing-library/react";
import type { LowStockProductDto } from "@/entities/dashboard";
import { dict } from "@/shared/config";
import { DashboardLowStockTable } from "./DashboardLowStockTable";

/**
 * TASK-253: the low-stock widget now surfaces sold-out (`stock === 0`) positions
 * with a distinct «Розпродано» badge instead of the numeric `0`, checked before
 * the `stock <= 2` critical branch. The header carries an info-icon tooltip
 * explaining the «Вільний залишок» semantics (reusing the `metricInfoAria`
 * helper, matching the dashboard StatCard convention).
 */
const products: LowStockProductDto[] = [
  { productId: "p0", productName: "Sold Out Phone", stock: 0 },
  { productId: "p2", productName: "Almost Gone Case", stock: 2 },
  { productId: "p5", productName: "Low Cable", stock: 5 },
];

describe("DashboardLowStockTable (TASK-253)", () => {
  it("renders a «Розпродано» badge for a sold-out row instead of the numeric 0", () => {
    render(<DashboardLowStockTable products={products} />);

    const soldOutRow = screen.getByText("Sold Out Phone").closest("tr");
    expect(soldOutRow).not.toBeNull();
    expect(
      within(soldOutRow as HTMLElement).getByText(dict.dashboard.soldOut),
    ).toBeInTheDocument();
    // The literal "0" must NOT be shown for the sold-out row.
    expect(
      within(soldOutRow as HTMLElement).queryByText("0"),
    ).not.toBeInTheDocument();
  });

  it("keeps a numeric badge for a critical (stock 2) row", () => {
    render(<DashboardLowStockTable products={products} />);

    const criticalRow = screen.getByText("Almost Gone Case").closest("tr");
    expect(
      within(criticalRow as HTMLElement).getByText("2"),
    ).toBeInTheDocument();
  });

  it("keeps a numeric badge for a low (stock 5) row", () => {
    render(<DashboardLowStockTable products={products} />);

    const lowRow = screen.getByText("Low Cable").closest("tr");
    expect(within(lowRow as HTMLElement).getByText("5")).toBeInTheDocument();
  });

  it("renders the column header info tooltip trigger with the correct aria-label", () => {
    render(<DashboardLowStockTable products={products} />);

    expect(
      screen.getByRole("button", {
        name: dict.dashboard.metricInfoAria(dict.dashboard.stock),
      }),
    ).toBeInTheDocument();
  });
});
