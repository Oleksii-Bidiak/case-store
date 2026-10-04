import {
  REVIEW_COLUMNS_WIDTH_BUDGET,
  buildReviewColumns,
} from "./admin-review-table";

describe("review queue columns — default widths (wave 198, В1 at 1440)", () => {
  it("fit the 1440 content area with the checkbox and «⋯» columns", () => {
    const visible = buildReviewColumns({
      onApprove: () => {},
      approvingId: null,
      busyId: null,
    }).filter((column) => column.defaultVisible !== false);
    const total = visible.reduce(
      (sum, column) => sum + (column.defaultWidth ?? 0),
      0,
    );

    // A column without a width falls back to the registry's 160 px and
    // silently blows the budget — the defect found twice in «База».
    expect(visible.every((column) => column.defaultWidth !== undefined)).toBe(
      true,
    );
    expect(total).toBeLessThanOrEqual(REVIEW_COLUMNS_WIDTH_BUDGET);
    expect(REVIEW_COLUMNS_WIDTH_BUDGET).toBe(1136 - 36 - 44 - 2);
  });
});
