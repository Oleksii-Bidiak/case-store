import { render, screen } from "@/shared/test/render";
import type { AdminProductListItemEntity } from "@/entities/product";
import { dict } from "@/shared/config";
import { formatDate } from "@/shared/lib";
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
          updatedAt: "2026-09-20T10:00:00.000Z",
          deletedAt: "2026-09-15T10:00:00.000Z",
          deletedBy: null,
        } as unknown as AdminProductListItemEntity)}
      </>,
    );
    expect(screen.getByText(/^видалено /)).toHaveClass("whitespace-nowrap");
  });
});

describe("productColumns — when and by whom it was deleted (TASK-1830, Т8)", () => {
  const d = dict.products;
  const updatedColumn = (isDeletedView: boolean) =>
    productColumns({ isDeletedView, categoryNames: new Map() }).find(
      (column) => column.id === "updated",
    )!;
  const row = (extra: Partial<AdminProductListItemEntity>) =>
    ({
      updatedAt: "2026-09-20T10:00:00.000Z",
      deletedAt: "2026-09-15T10:00:00.000Z",
      deletedBy: null,
      ...extra,
    }) as unknown as AdminProductListItemEntity;

  it("dates the row by deletedAt — not by updatedAt, which may move later", () => {
    render(<>{updatedColumn(true).cell(row({}))}</>);
    expect(
      screen.getByText(d.deletedOn(formatDate("2026-09-15T10:00:00.000Z"))),
    ).toBeInTheDocument();
    expect(
      screen.queryByText(d.deletedOn(formatDate("2026-09-20T10:00:00.000Z"))),
    ).not.toBeInTheDocument();
  });

  it("names who deleted it on a second line", () => {
    render(
      <>
        {updatedColumn(true).cell(
          row({ deletedBy: { id: "u-1", name: "Олена К." } }),
        )}
      </>,
    );
    expect(screen.getByText("Олена К.")).toBeInTheDocument();
  });

  it("shortens a full name to the Т8 form and keeps it whole in the title", () => {
    render(
      <>
        {updatedColumn(true).cell(
          row({ deletedBy: { id: "u-2", name: "Олена Коваленко" } }),
        )}
      </>,
    );
    const line = screen.getByText("Олена К.");
    expect(line).toHaveAttribute("title", "Олена Коваленко");
    expect(screen.queryByText("Олена Коваленко")).not.toBeInTheDocument();
  });

  // The API sends no name (never an email) for an actor without one.
  it("says «співробітник» for an actor on record without a name", () => {
    render(
      <>
        {updatedColumn(true).cell(
          row({ deletedBy: { id: "u-9", name: null } }),
        )}
      </>,
    );
    expect(screen.getByText(d.deletedByUnnamed)).toBeInTheDocument();
  });

  it("draws no actor line while the log has none", () => {
    const { container } = render(<>{updatedColumn(true).cell(row({}))}</>);
    expect(container.textContent).toBe(
      d.deletedOn(formatDate("2026-09-15T10:00:00.000Z")),
    );
  });

  it("sorts by deletedAt in «Видалені» only", () => {
    expect(updatedColumn(true).sortField).toBe("deletedAt");
    expect(updatedColumn(true).sortHint).toBe(d.colDeletedSortHint);
    expect(updatedColumn(false).sortField).toBeUndefined();
  });
});
