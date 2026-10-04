import {
  ADDON_SERVICE_COLUMNS_WIDTH_BUDGET,
  buildAddonServiceColumns,
} from "./addon-service-registry-columns";

describe("add-on service list columns — default widths (wave 198, ДП1 at 1440)", () => {
  it("fit the 1440 content area with the «⋯» column", () => {
    const visible = buildAddonServiceColumns({
      pendingIds: new Set(),
      onOpen: () => undefined,
    }).filter((column) => column.defaultVisible !== false);
    const total = visible.reduce(
      (sum, column) => sum + (column.defaultWidth ?? 0),
      0,
    );

    // A column without a width falls back to the registry's 160 px and
    // silently blows the budget.
    expect(visible.every((column) => column.defaultWidth !== undefined)).toBe(
      true,
    );
    expect(total).toBeLessThanOrEqual(ADDON_SERVICE_COLUMNS_WIDTH_BUDGET);
  });
});
