import { render, screen } from "@/shared/test/render";
import type { ProductEntity } from "@/entities/product";
import {
  DEFAULT_WIDTH_BUDGET,
  DELETED_VIEW_WIDTH_BUDGET,
  productColumns,
} from "./product-registry-columns";

describe("productColumns — default widths (wave 198, Т1 at 1440)", () => {
  it("fit the 1440 content area with the checkbox and «⋯» columns", () => {
    const columns = productColumns({
      isDeletedView: false,
      categoryNames: new Map(),
    });
    const visible = columns.filter((column) => column.defaultVisible !== false);
    const total = visible.reduce(
      (sum, column) => sum + (column.defaultWidth ?? 0),
      0,
    );

    // Every default-visible column declares its width — a missing one would
    // fall back to the registry's 160 px and silently blow the budget.
    expect(visible.every((column) => column.defaultWidth !== undefined)).toBe(
      true,
    );
    expect(total).toBeLessThanOrEqual(DEFAULT_WIDTH_BUDGET);
    // «Оновлено» keeps room for «04.10.2026, 09:12».
    expect(
      visible.find((column) => column.id === "updated")?.defaultWidth,
    ).toBeGreaterThanOrEqual(150);
  });

  it("fit «Видалені» too, where «Відновити» takes the trailing cell (TASK-656, Т8)", () => {
    const columns = productColumns({
      isDeletedView: true,
      categoryNames: new Map(),
    });
    const total = columns
      .filter((column) => column.defaultVisible !== false)
      .reduce((sum, column) => sum + (column.defaultWidth ?? 0), 0);

    expect(total).toBeLessThanOrEqual(DELETED_VIEW_WIDTH_BUDGET);
  });

  it("keep «видалено 15.09.2026» on one line in «Видалені» (Т8)", () => {
    const updated = productColumns({
      isDeletedView: true,
      categoryNames: new Map(),
    }).find((column) => column.id === "updated");

    // Room for the phrase itself (≈140 px) plus the cell's 16 px padding.
    expect(updated?.defaultWidth).toBeGreaterThanOrEqual(160);
    render(
      <>
        {updated?.cell({
          updatedAt: "2026-09-15T10:00:00.000Z",
        } as unknown as ProductEntity)}
      </>,
    );
    expect(screen.getByText(/^видалено /)).toHaveClass("whitespace-nowrap");
  });
});
