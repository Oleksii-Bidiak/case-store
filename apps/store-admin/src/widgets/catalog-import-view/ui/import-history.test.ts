import {
  IMPORT_HISTORY_WIDTH_BUDGET,
  buildHistoryColumns,
} from "./import-history";

describe("import history columns — default widths (wave 198, ІК1 at 1440)", () => {
  it("fit the 1440 content area with the «⋯» column", () => {
    const visible = buildHistoryColumns().filter(
      (column) => column.defaultVisible !== false,
    );
    const total = visible.reduce(
      (sum, column) => sum + (column.defaultWidth ?? 0),
      0,
    );
    expect(visible.every((column) => column.defaultWidth !== undefined)).toBe(
      true,
    );
    expect(total).toBeLessThanOrEqual(IMPORT_HISTORY_WIDTH_BUDGET);
  });

  it("budgets for the «⋯» column and the border only — no checkbox column", () => {
    expect(IMPORT_HISTORY_WIDTH_BUDGET).toBe(1136 - 44 - 2);
  });
});
