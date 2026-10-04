import {
  RETURN_COLUMNS_WIDTH_BUDGET,
  buildReturnColumns,
} from "./admin-return-table";

describe("return list columns — default widths (wave 198, Р1 at 1440)", () => {
  it("fit the 1440 content area with the «⋯» column", () => {
    const visible = buildReturnColumns(Date.now()).filter(
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
    expect(total).toBeLessThanOrEqual(RETURN_COLUMNS_WIDTH_BUDGET);
  });

  it("budgets for the «⋯» column and the border only — no checkbox column", () => {
    expect(RETURN_COLUMNS_WIDTH_BUDGET).toBe(1136 - 44 - 2);
  });
});
