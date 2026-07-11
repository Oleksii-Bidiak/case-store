import { render, screen, within } from "@/shared/test/render";
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
 * jsdom has no layout, so the card breakpoint is simulated by stubbing
 * `window.matchMedia` — the same source `TableRow` reads to decide whether the
 * card layout is actually painted (TASK-276).
 */
function setCardViewport(matches: boolean) {
  window.matchMedia = ((query: string) => ({
    matches,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
}

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
    // No sr-only prefix either — cell text is exactly its children.
    expect(cells[0].querySelector(".sr-only")).toBeNull();
    expect(cells[0].textContent).toBe("OK");
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

  it("announces the label to screen readers via an sr-only prefix", () => {
    const { cells } = renderCardTable();
    const srLabel = cells[0].querySelector(".sr-only");
    expect(srLabel).not.toBeNull();
    expect(srLabel?.textContent).toBe("Name: ");
    // Prefix comes before the value in reading order.
    expect(cells[0].textContent).toBe("Name: Alice");
  });

  it("renders an unlabeled cell with no caption artifact", () => {
    const { cells } = renderCardTable();
    const unlabeled = cells[2];
    expect(unlabeled).not.toHaveAttribute("data-label");
    expect(unlabeled.className).not.toContain("before:");
    expect(unlabeled.querySelector(".sr-only")).toBeNull();
    expect(unlabeled.textContent).toBe("unlabeled");
    // Still stacks as a card row.
    expect(unlabeled).toHaveClass("max-md:flex");
  });

  it("adds no sr-only prefix to a hideOnMobile cell (hidden below md, visible header at md+)", () => {
    const { cells } = renderCardTable();
    expect(cells[1].querySelector(".sr-only")).toBeNull();
  });

  it("never renders a literal 'undefined' caption", () => {
    const { container } = renderCardTable();
    expect(container.textContent).not.toContain("undefined");
  });
});

describe("Card-mode row grouping (TASK-276)", () => {
  const originalMatchMedia = window.matchMedia;

  afterEach(() => {
    window.matchMedia = originalMatchMedia;
  });

  function renderRows(layout: "scroll" | "card", rowLabel?: string) {
    return renderTable(
      <Table layout={layout}>
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead>Price</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          <TableRow rowLabel={rowLabel}>
            <TableCell label="Name">AirPods Pro</TableCell>
            <TableCell label="Price">$249</TableCell>
          </TableRow>
        </TableBody>
      </Table>,
    );
  }

  it("exposes a card-mode row as a labelled group (narrow viewport)", () => {
    setCardViewport(true);
    renderRows("card", "AirPods Pro");

    const group = screen.getByRole("group", { name: "AirPods Pro" });
    expect(group).toHaveAttribute("data-slot", "table-row");
    // The row's fields are announced inside the group boundary.
    expect(within(group).getByText("$249")).toBeInTheDocument();
  });

  it("keeps the sr-only cell labels inside the group", () => {
    setCardViewport(true);
    const { cells } = renderRows("card", "AirPods Pro");
    expect(cells[0].querySelector(".sr-only")?.textContent).toBe("Name: ");
    expect(cells[0].textContent).toBe("Name: AirPods Pro");
  });

  it("renders no empty aria-label when rowLabel is omitted", () => {
    setCardViewport(true);
    const { row } = renderRows("card");
    expect(row).toHaveAttribute("role", "group");
    expect(row).not.toHaveAttribute("aria-label");
  });

  it("renders no empty aria-label when rowLabel is blank", () => {
    setCardViewport(true);
    const { row } = renderRows("card", "   ");
    expect(row).toHaveAttribute("role", "group");
    expect(row).not.toHaveAttribute("aria-label");
  });

  it("leaves native table semantics intact at md+ (card layout not painted)", () => {
    setCardViewport(false);
    const { row } = renderRows("card", "AirPods Pro");
    expect(row).not.toHaveAttribute("role");
    expect(row).not.toHaveAttribute("aria-label");
    expect(screen.queryByRole("group")).toBeNull();
    // Still a real table row.
    expect(screen.getAllByRole("row")).toHaveLength(2);
  });

  it("never groups rows in scroll layout, even on a narrow viewport", () => {
    setCardViewport(true);
    const { row } = renderRows("scroll", "AirPods Pro");
    expect(row).not.toHaveAttribute("role");
    expect(screen.queryByRole("group")).toBeNull();
  });

  it("does not group the header row in card mode", () => {
    setCardViewport(true);
    const { container } = renderRows("card", "AirPods Pro");
    const headerRow = container.querySelector(
      '[data-slot="table-header"] [data-slot="table-row"]',
    );
    expect(headerRow).not.toHaveAttribute("role");
    expect(screen.getAllByRole("group")).toHaveLength(1);
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
