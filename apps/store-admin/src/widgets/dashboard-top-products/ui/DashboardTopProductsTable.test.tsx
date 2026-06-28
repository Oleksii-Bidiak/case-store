import { renderWithProviders, screen } from "@/shared/test/render";
import { dict } from "@/shared/config";
import { DashboardTopProductsTable } from "./DashboardTopProductsTable";

function makeProducts() {
  return [
    { productId: "p-1", name: "USB-C Cable 2m", totalRevenue: 3420 },
    { productId: "p-2", name: "Silicone Case", totalRevenue: 1290 },
    { productId: "p-3", name: "Screen Protector", totalRevenue: 540 },
  ];
}

describe("DashboardTopProductsTable (TASK-152)", () => {
  it("renders ranked rows with product name and formatted revenue", () => {
    renderWithProviders(
      <DashboardTopProductsTable products={makeProducts()} />,
    );

    // All three products render.
    expect(screen.getByText("USB-C Cable 2m")).toBeInTheDocument();
    expect(screen.getByText("Silicone Case")).toBeInTheDocument();
    expect(screen.getByText("Screen Protector")).toBeInTheDocument();

    // Ranks are 1-based and in order.
    const rows = screen.getAllByRole("row").slice(1); // drop the header row
    expect(rows[0]).toHaveTextContent("1");
    expect(rows[0]).toHaveTextContent("USB-C Cable 2m");
    expect(rows[2]).toHaveTextContent("3");

    // Revenue is formatted as UAH currency (uk-UA / ₴), not a bare number.
    expect(screen.queryByText("3420")).not.toBeInTheDocument();
    expect(screen.getByText(/3[\s ]?420/)).toBeInTheDocument();
  });

  it("renders the empty-state row when there are no products", () => {
    renderWithProviders(<DashboardTopProductsTable products={[]} />);

    expect(screen.getByText(dict.dashboard.noTopProducts)).toBeInTheDocument();
    // No data rows beyond the header.
    expect(screen.queryByText("USB-C Cable 2m")).not.toBeInTheDocument();
  });
});
