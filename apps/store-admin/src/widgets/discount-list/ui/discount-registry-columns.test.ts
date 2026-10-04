import {
  DISCOUNT_COLUMNS_WIDTH_BUDGET,
  buildDiscountColumns,
} from "./discount-registry-columns";

describe("discount list columns — default widths (wave 198, ПК1 at 1440)", () => {
  it("fit the 1440 content area with the «⋯» column", () => {
    const visible = buildDiscountColumns({ now: 0 }).filter(
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
    expect(total).toBeLessThanOrEqual(DISCOUNT_COLUMNS_WIDTH_BUDGET);
  });

  it("budgets for the «⋯» column and the border only — no checkbox column (no bulk API)", () => {
    expect(DISCOUNT_COLUMNS_WIDTH_BUDGET).toBe(1136 - 44 - 2);
  });

  it("sorts only by what the API's @IsIn accepts", () => {
    const fields = buildDiscountColumns({ now: 0 })
      .map((column) => column.sortField)
      .filter(Boolean);
    expect(fields).toEqual(["code", "redeemedCount", "expiresAt"]);
  });
});
