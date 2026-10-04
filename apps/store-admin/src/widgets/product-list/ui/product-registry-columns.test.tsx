import {
  DEFAULT_WIDTH_BUDGET,
  productColumns,
} from "./product-registry-columns";

describe("productColumns — default widths (wave 198, Т1 at 1440)", () => {
  it("fit the 1440 content area with the checkbox and «⋯» columns", () => {
    const columns = productColumns({
      isDeletedView: false,
      categoryNames: new Map(),
    });
    const visible = columns.filter((column) => column.defaultVisible !== false);
    const total = visible.reduce(
      (sum, column) => sum + (column.defaultWidth ?? 0),
      0,
    );

    // Every default-visible column declares its width — a missing one would
    // fall back to the registry's 160 px and silently blow the budget.
    expect(visible.every((column) => column.defaultWidth !== undefined)).toBe(
      true,
    );
    expect(total).toBeLessThanOrEqual(DEFAULT_WIDTH_BUDGET);
    // «Оновлено» keeps room for «04.10.2026, 09:12».
    expect(
      visible.find((column) => column.id === "updated")?.defaultWidth,
    ).toBeGreaterThanOrEqual(150);
  });
});
