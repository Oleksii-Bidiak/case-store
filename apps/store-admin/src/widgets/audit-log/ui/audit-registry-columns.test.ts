import { AUDIT_COLUMNS_WIDTH_BUDGET, buildAuditColumns } from "./AuditLogView";

describe("audit log columns — default widths (wave 198, Ж1/Ж6 at 1440)", () => {
  it.each([true, false])(
    "fit the 1440 content area with the expand column (grouped: %s)",
    (grouped) => {
      const visible = buildAuditColumns(grouped, new Map()).filter(
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
      expect(total).toBeLessThanOrEqual(AUDIT_COLUMNS_WIDTH_BUDGET);
    },
  );

  it("budgets for the trailing toggle column and the border — no checkbox", () => {
    expect(AUDIT_COLUMNS_WIDTH_BUDGET).toBe(1136 - 44 - 2);
  });
});
