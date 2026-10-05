import {
  BRAND_COLUMNS_WIDTH_BUDGET,
  brandInitials,
  buildBrandColumns,
} from "./brand-registry-columns";

describe("brand list columns — default widths (wave 198, БР1 at 1440)", () => {
  it.each([true, false])(
    "fit the 1440 content area with the «⋯» column (products link: %s)",
    (canOpenProducts) => {
      const visible = buildBrandColumns({ canOpenProducts }).filter(
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
      expect(total).toBeLessThanOrEqual(BRAND_COLUMNS_WIDTH_BUDGET);
    },
  );

  it("budgets for the «⋯» column and the border only — no checkbox column (no bulk API)", () => {
    expect(BRAND_COLUMNS_WIDTH_BUDGET).toBe(1136 - 44 - 2);
  });
});

describe("brandInitials", () => {
  it.each([
    ["Apple", "Ap"],
    ["Baseus Official", "BO"],
    ["JBL", "JB"],
    ["  Zagg ", "Za"],
  ])("%s → %s", (name, initials) => {
    expect(brandInitials(name)).toBe(initials);
  });
});
