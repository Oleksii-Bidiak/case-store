import { buildColumns, ORDER_COLUMNS_WIDTH_BUDGET } from "./admin-order-table";

describe("order list columns — default widths (wave 198, П1 at 1440)", () => {
  it("fit the 1440 content area with the «⋯» column", () => {
    const visible = buildColumns(Date.now()).filter(
      (column) => column.defaultVisible !== false,
    );
    const total = visible.reduce(
      (sum, column) => sum + (column.defaultWidth ?? 0),
      0,
    );

    // A column without a width falls back to the registry's 160 px and
    // silently blows the budget — «Сума» and «Поз.» were clipped that way.
    expect(visible.every((column) => column.defaultWidth !== undefined)).toBe(
      true,
    );
    expect(total).toBeLessThanOrEqual(ORDER_COLUMNS_WIDTH_BUDGET);
  });
});
