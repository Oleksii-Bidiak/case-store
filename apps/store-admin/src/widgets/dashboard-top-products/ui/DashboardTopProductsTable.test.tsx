import { renderWithProviders, screen } from "@/shared/test/render";
import { dict } from "@/shared/config";
import { DashboardTopProductsTable } from "./DashboardTopProductsTable";

function makeProducts() {
  return [
    {
      productId: "p-1",
      name: "USB-C Cable 2m",
      totalRevenue: 3420,
      unitsSold: 12,
    },
    {
      productId: "p-2",
      name: "Silicone Case",
      totalRevenue: 1290,
      unitsSold: 3,
    },
    {
      productId: "p-3",
      name: "Screen Protector",
      totalRevenue: 540,
      unitsSold: 9,
    },
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

  it("links each product name to the READ-ONLY card, not to the edit form (TASK-430)", () => {
    renderWithProviders(
      <DashboardTopProductsTable products={makeProducts()} />,
    );

    const link = screen.getByRole("link", {
      name: dict.dashboard.topProductLinkAria("USB-C Cable 2m"),
    });

    // `/products/<id>` — clicking a dashboard metric is a question about the
    // position; `/products/<id>/edit` would be a form opened by accident.
    expect(link).toHaveAttribute("href", "/products/p-1");
    expect(link.getAttribute("href")).not.toContain("/edit");
  });

  it("links every row, not just the first", () => {
    renderWithProviders(
      <DashboardTopProductsTable products={makeProducts()} />,
    );

    expect(
      screen.getAllByRole("link").map((a) => a.getAttribute("href")),
    ).toEqual(["/products/p-1", "/products/p-2", "/products/p-3"]);
  });

  /**
   * TASK-684: without `analytics:revenue` the API strips `totalRevenue` from
   * every row and ranks the list by units sold. The table must follow: no money
   * column (a column of blanks, or of «0 ₴», would misreport the shop), units
   * in its place, and a heading that no longer claims the list is by revenue.
   */
  it("shows units instead of money when the API withheld the sums (TASK-684)", () => {
    const unitsOnly = [
      { productId: "p-3", name: "Screen Protector", unitsSold: 9 },
      { productId: "p-2", name: "Silicone Case", unitsSold: 3 },
    ];
    const { container } = renderWithProviders(
      <DashboardTopProductsTable products={unitsOnly} />,
    );

    expect(
      screen.queryByText(dict.dashboard.totalRevenue),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText(dict.dashboard.topProducts),
    ).not.toBeInTheDocument();
    expect(
      screen.getByText(dict.dashboard.topProductsByUnits),
    ).toBeInTheDocument();
    expect(screen.getByText(dict.dashboard.unitsSold)).toBeInTheDocument();
    expect(container.textContent).not.toContain("₴");

    const rows = screen.getAllByRole("row").slice(1);
    expect(rows[0]).toHaveTextContent("Screen Protector");
    expect(rows[0]).toHaveTextContent("9");
  });

  it("keeps the revenue heading for a revenue holder whose list is still empty (TASK-684)", () => {
    // An empty list cannot say whether its caller was sent money, so the view
    // says it: an owner with no paid sales yet is not a manager without the key.
    renderWithProviders(
      <DashboardTopProductsTable products={[]} showsRevenue />,
    );

    expect(screen.getByText(dict.dashboard.topProducts)).toBeInTheDocument();
    expect(screen.getByText(dict.dashboard.totalRevenue)).toBeInTheDocument();
  });

  it("renders the empty-state row when there are no products", () => {
    renderWithProviders(<DashboardTopProductsTable products={[]} />);

    expect(screen.getByText(dict.dashboard.noTopProducts)).toBeInTheDocument();
    // No data rows beyond the header.
    expect(screen.queryByText("USB-C Cable 2m")).not.toBeInTheDocument();
  });

  /**
   * TASK-1037 drew «Усі товари за виручкою →» / «за продажами →». The product
   * list cannot sort by revenue at all, and its `bestselling` sort counts PAID
   * units gross while this list counts the sales report's net base — a link
   * would open a list that disagrees with the five rows above it. So no link
   * until the API grows that sort (API tail of TASK-1037).
   */
  it("offers no «Усі товари…» link — the product list cannot sort the same way", () => {
    renderWithProviders(
      <DashboardTopProductsTable products={makeProducts()} showsRevenue />,
    );

    const links = screen.getAllByRole("link");
    // Only the per-row card links (TASK-430).
    expect(links).toHaveLength(3);
    for (const link of links) {
      expect(link.getAttribute("href")).toMatch(/^\/products\/p-\d$/);
    }
  });
});
