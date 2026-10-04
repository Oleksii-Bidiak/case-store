import {
  PRODUCT_GROUP_COLUMNS,
  PRODUCT_GROUP_COLUMNS_WIDTH_BUDGET,
} from "./product-group-registry-columns";

describe("product group list columns — default widths (wave 198, ГТ1 at 1440)", () => {
  it("fit the 1440 content area with the «⋯» column", () => {
    const visible = PRODUCT_GROUP_COLUMNS.filter(
      (column) => column.defaultVisible !== false,
    );
    const total = visible.reduce(
      (sum, column) => sum + (column.defaultWidth ?? 0),
      0,
    );

    // A column without a width falls back to the registry's 160 px and
    // silently blows the budget.
    expect(visible.every((column) => column.defaultWidth !== undefined)).toBe(
      true,
    );
    expect(total).toBeLessThanOrEqual(PRODUCT_GROUP_COLUMNS_WIDTH_BUDGET);
  });
});
