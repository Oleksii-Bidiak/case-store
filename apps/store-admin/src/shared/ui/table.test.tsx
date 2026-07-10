import { render } from "@/shared/test/render";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "./table";
import { SortableColumnHeader } from "./sortable-column-header";

/**
 * Responsive table primitive (TASK-258-A).
 *
 * jsdom has no real viewport, so these tests assert the presence/absence of
 * the `max-md:` / `hidden md:table-cell` utility classes and `data-label`
 * attributes — the real-device visual check lives in docs/manual-qa-pending.md.
 */

function renderTable(ui: React.ReactElement) {
  const { container, ...rest } = render(ui);
  return {
    container,
    ...rest,
    table: container.querySelector('[data-slot="table"]') as HTMLElement,
    header: container.querySelector('[data-slot="table-header"]'),
    body: container.querySelector('[data-slot="table-body"]'),
    row: container.querySelector(
      '[data-slot="table-body"] [data-slot="table-row"]',
    ) as HTMLElement,
    cells: Array.from(
      container.querySelectorAll('[data-slot="table-cell"]'),
    ) as HTMLElement[],
  };
}

describe("Table (default scroll layout — regression guard)", () => {
  it("renders byte-for-byte the pre-TASK-258 classes when layout is omitted", () => {
    const { table, header, body, row, cells } = renderTable(
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          <TableRow>
            <TableCell>Alice</TableCell>
          </TableRow>
        </TableBody>
      </Table>,
    );

    expect(table).toHaveClass("w-full", "caption-bottom", "text-sm");
    expect(table.className).not.toContain("max-md:");
    expect(header?.className).not.toContain("max-md:");
    expect(body?.className).not.toContain("max-md:");
    expect(row).toHaveClass("border-b", "transition-colors");
    expect(row.className).not.toContain("max-md:");
    expect(cells[0]).toHaveClass(
      "px-4",
      "py-3",
      "align-middle",
      "whitespace-nowrap",
    );
    expect(cells[0].className).not.toContain("max-md:");
    expect(cells[0].className).not.toContain("hidden");
    expect(cells[0]).not.toHaveAttribute("data-label");
  });

  it("ignores `label` in scroll mode (no data-label, no caption classes)", () => {
    const { cells } = renderTable(
      <Table>
        <TableBody>
          <TableRow>
            <TableCell label="Status">OK</TableCell>
          </TableRow>
        </TableBody>
      </Table>,
    );

    expect(cells[0]).not.toHaveAttribute("data-label");
    expect(cells[0].className).not.toContain("before:");
  });
});

describe("Table (layout='card')", () => {
  function renderCardTable() {
    return renderTable(
      <Table layout="card">
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead hideOnMobile>Created</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          <TableRow>
            <TableCell label="Name">Alice</TableCell>
            <TableCell hideOnMobile>2026-07-10</TableCell>
            <TableCell>unlabeled</TableCell>
          </TableRow>
        </TableBody>
      </Table>,
    );
  }

  it("switches the table to block below md", () => {
    const { table } = renderCardTable();
    expect(table).toHaveClass("max-md:block");
  });

  it("hides the header below md", () => {
    const { header } = renderCardTable();
    expect(header).toHaveClass("max-md:hidden");
  });

  it("renders body rows as bordered card blocks below md", () => {
    const { row } = renderCardTable();
    expect(row).toHaveClass(
      "max-md:flex",
      "max-md:flex-col",
      "max-md:rounded-lg",
      "max-md:border",
      "max-md:border-border",
      "max-md:shadow-card",
    );
    // Desktop classes remain intact (md+ is identical to scroll mode).
    expect(row).toHaveClass("border-b", "transition-colors");
  });

  it("renders a labeled cell with data-label + caption pseudo-element classes", () => {
    const { cells } = renderCardTable();
    const labeled = cells[0];
    expect(labeled).toHaveAttribute("data-label", "Name");
    expect(labeled.className).toContain(
      "max-md:before:content-[attr(data-label)]",
    );
    expect(labeled).toHaveClass("max-md:flex", "max-md:justify-between");
  });

  it("renders an unlabeled cell with no caption artifact", () => {
    const { cells } = renderCardTable();
    const unlabeled = cells[2];
    expect(unlabeled).not.toHaveAttribute("data-label");
    expect(unlabeled.className).not.toContain("before:");
    expect(unlabeled.textContent).toBe("unlabeled");
    // Still stacks as a card row.
    expect(unlabeled).toHaveClass("max-md:flex");
  });

  it("never renders a literal 'undefined' caption", () => {
    const { container } = renderCardTable();
    expect(container.textContent).not.toContain("undefined");
  });
});

describe("hideOnMobile (both layout modes)", () => {
  it.each(["scroll", "card"] as const)(
    "adds `hidden md:table-cell` to head and cell in %s mode",
    (layout) => {
      const { container } = render(
        <Table layout={layout}>
          <TableHeader>
            <TableRow>
              <TableHead hideOnMobile>Created</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            <TableRow>
              <TableCell hideOnMobile>2026-07-10</TableCell>
            </TableRow>
          </TableBody>
        </Table>,
      );

      const head = container.querySelector('[data-slot="table-head"]');
      const cell = container.querySelector('[data-slot="table-cell"]');
      expect(head).toHaveClass("hidden", "md:table-cell");
      expect(cell).toHaveClass("hidden", "md:table-cell");
    },
  );

  it("does not add card flex classes to a hideOnMobile cell in card mode", () => {
    const { container } = render(
      <Table layout="card">
        <TableBody>
          <TableRow>
            <TableCell hideOnMobile>secondary</TableCell>
          </TableRow>
        </TableBody>
      </Table>,
    );
    const cell = container.querySelector(
      '[data-slot="table-cell"]',
    ) as HTMLElement;
    expect(cell).toHaveClass("hidden", "md:table-cell");
    expect(cell.className).not.toContain("max-md:flex");
  });
});

describe("SortableColumnHeader hideOnMobile pass-through", () => {
  it("forwards hideOnMobile to the underlying TableHead", () => {
    const { container } = render(
      <table>
        <thead>
          <tr>
            <SortableColumnHeader
              field="createdAt"
              label="Created"
              onSort={jest.fn()}
              hideOnMobile
            />
          </tr>
        </thead>
      </table>,
    );
    expect(container.querySelector('[data-slot="table-head"]')).toHaveClass(
      "hidden",
      "md:table-cell",
    );
  });

  it("stays visible without hideOnMobile", () => {
    const { container } = render(
      <table>
        <thead>
          <tr>
            <SortableColumnHeader
              field="createdAt"
              label="Created"
              onSort={jest.fn()}
            />
          </tr>
        </thead>
      </table>,
    );
    const head = container.querySelector('[data-slot="table-head"]');
    expect(head?.className).not.toContain("hidden");
  });
});
