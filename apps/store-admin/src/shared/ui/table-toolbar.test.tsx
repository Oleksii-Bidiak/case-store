import { render, screen } from "@/shared/test/render";
import { TableToolbar } from "./table-toolbar";

function toolbarOf(container: HTMLElement): HTMLElement {
  return container.querySelector('[data-slot="table-toolbar"]') as HTMLElement;
}

describe("TableToolbar layout (TASK-775)", () => {
  it("stacks as a column below md and lays out as a row from md", () => {
    const { container } = render(<TableToolbar search={<input />} />);
    const bar = toolbarOf(container);

    expect(bar).toHaveClass("flex", "flex-col", "md:flex-row");
    // Below md the children fill the width; from md they centre on the row.
    expect(bar).toHaveClass("items-stretch", "md:items-center");
  });

  it("never carries an unprefixed row-breaking direction (the be2da26e regression)", () => {
    const { container } = render(<TableToolbar search={<input />} />);
    const classes = toolbarOf(container).className.split(/\s+/);

    // `flex-col` is allowed only because `md:flex-row` overrides it; any other
    // unprefixed direction/wrap would pin every viewport to one layout.
    expect(classes).toContain("md:flex-row");
    expect(classes).not.toContain("flex-col-reverse");
    // Wrapping is scoped to the row (`md:flex-wrap`); unprefixed it would be
    // meaningless in column mode and hide where the row behaviour lives.
    expect(classes).not.toContain("flex-wrap");
    expect(classes).toContain("md:flex-wrap");
    // `items-center` unprefixed would shrink the search to its content width
    // and centre it in column mode.
    expect(classes).not.toContain("items-center");
  });

  it("lets the search grow along the row from md, not along the column", () => {
    render(<TableToolbar search={<input aria-label="Пошук" />} />);
    const wrapper = screen.getByRole("textbox", { name: "Пошук" })
      .parentElement as HTMLElement;

    expect(wrapper).toHaveClass("min-w-0", "md:flex-1");
    expect(wrapper).not.toHaveClass("flex-1");
  });

  it("keeps a width floor on the search so wide filters wrap instead of crushing it (TASK-732)", () => {
    render(<TableToolbar search={<input aria-label="Пошук" />} />);
    const wrapper = screen.getByRole("textbox", { name: "Пошук" })
      .parentElement as HTMLElement;

    expect(wrapper).toHaveClass("md:min-w-64");
  });

  it("keeps a call-site className (every list passes mb-0)", () => {
    const { container } = render(
      <TableToolbar search={<input />} className="mb-0" />,
    );
    const bar = toolbarOf(container);

    expect(bar).toHaveClass("mb-0", "md:flex-row");
    expect(bar).not.toHaveClass("mb-4");
  });
});
