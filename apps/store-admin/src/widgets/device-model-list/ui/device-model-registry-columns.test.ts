import {
  DEVICE_MODEL_COLUMNS_WIDTH_BUDGET,
  buildDeviceModelColumns,
} from "./device-model-registry-columns";

describe("device model list columns — default widths (wave 198, ПР1 at 1440)", () => {
  it("fit the 1440 content area with the «⋯» column", () => {
    const visible = buildDeviceModelColumns({ pagesOf: () => 0 }).filter(
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
    expect(total).toBeLessThanOrEqual(DEVICE_MODEL_COLUMNS_WIDTH_BUDGET);
  });

  it("budgets for the «⋯» column and the border only — no checkbox column (no bulk API)", () => {
    expect(DEVICE_MODEL_COLUMNS_WIDTH_BUDGET).toBe(1136 - 44 - 2);
  });
});
