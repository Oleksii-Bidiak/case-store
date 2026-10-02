import { render, screen } from "@/shared/test/render";
import { ProductListSkeleton } from "@/widgets/product-list/ui/product-list-skeleton";
import Loading from "./loading";

/**
 * TASK-416 — the `/products` loading boundary stands in for the whole page, so
 * it must show the catalogue SHELL (chips, toolbar, 268px filter rail), not a
 * bare full-width grid that then jumps left by a column. The card grid itself
 * must stay byte-identical to the sidebar-less variant guarded by the parity
 * test in `product-list.test.tsx`.
 */
describe("products loading boundary (TASK-416)", () => {
  /** The card grid — always the LAST `.grid` in either tree. */
  const cardGrid = (root: HTMLElement) => {
    const grids = root.querySelectorAll(".grid");
    return grids[grids.length - 1];
  };

  it("renders the catalogue shell with the desktop filter rail", () => {
    const { container } = render(<Loading />);

    const grids = container.querySelectorAll(".grid");
    // Two grids: the sidebar/results split, then the card grid inside it.
    expect(grids).toHaveLength(2);
    expect(grids[0]).toHaveClass("lg:grid-cols-[268px_1fr]");
  });

  it("keeps the card grid identical to the plain skeleton", () => {
    const { container } = render(<Loading />);
    const { container: plain } = render(<ProductListSkeleton />);

    expect(cardGrid(container).className).toBe(cardGrid(plain).className);
  });

  it("reserves the breadcrumb and title rows the page renders above the results", () => {
    const { container } = render(<Loading />);

    // Breadcrumb + h1 + subtitle placeholders, all inert for screen readers.
    expect(
      container.querySelectorAll('[aria-hidden="true"]').length,
    ).toBeGreaterThan(1);
    expect(screen.queryByRole("heading")).not.toBeInTheDocument();
  });
});
