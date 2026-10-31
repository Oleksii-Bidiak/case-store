import { render, screen } from "@/shared/test/render";
import { filterRailSections } from "@/features/product-filters";
import { dict } from "@/shared/config";
import { ProductListSkeleton } from "./product-list-skeleton";

/**
 * TASK-515 — the placeholder filter rail must draw the very cards the real rail
 * renders, in its order, or the page jumps when the skeleton is swapped out.
 * The rail used to be a hand-kept list of five heights; the panel had grown to
 * six on `/products` («Знижки», TASK-742) and seven on a category page
 * («Характеристики»), so the skeleton was ~225px short on every catalogue load.
 */
describe("ProductListSkeleton — filter rail (TASK-515)", () => {
  const railSections = () =>
    [
      ...screen
        .getByTestId("filter-rail-skeleton")
        .querySelectorAll("[data-section]"),
    ].map((card) => card.getAttribute("data-section"));
  // «Зі знижкою» is a row inside the price block (Д3-2 Catalog §12), not a
  // block of its own.
  const drawn = (sections: string[]) =>
    sections.filter((section) => section !== "onSale");

  it("mirrors the default /products rail, «Знижки» included", () => {
    render(<ProductListSkeleton withSidebar />);

    expect(railSections()).toEqual(
      drawn(filterRailSections({ withMyDevices: true })),
    );
    expect(screen.getByTestId("filter-panel-skeleton")).toBeInTheDocument();
    expect(railSections()).not.toContain("specs");
  });

  it("reserves «Характеристики» once a category is set", () => {
    render(<ProductListSkeleton withSidebar hasCategory />);

    expect(railSections()).toEqual(
      drawn(filterRailSections({ hasCategory: true, withMyDevices: true })),
    );
    expect(railSections().at(-1)).toBe("specs");
  });

  it("drops the device card where the route fixes the device", () => {
    render(<ProductListSkeleton withSidebar hasCategory lockedDevice />);

    expect(railSections()).toEqual(
      drawn(
        filterRailSections({
          hasCategory: true,
          lockedDevice: true,
          withMyDevices: true,
        }),
      ),
    );
  });

  it("drops «Знижки» on /promo, where the route fixes the discount", () => {
    render(<ProductListSkeleton withSidebar lockedOnSale />);

    expect(railSections()).toEqual(
      drawn(filterRailSections({ lockedOnSale: true, withMyDevices: true })),
    );
    expect(railSections()).not.toContain("onSale");
  });

  // TASK-2077 — «З урахуванням моїх пристроїв» is the first filter card.
  it("reserves the my-devices card first", () => {
    render(<ProductListSkeleton withSidebar />);
    expect(railSections()[0]).toBe("myDevices");
  });

  it("gives every card a height, so no section collapses to zero", () => {
    render(<ProductListSkeleton withSidebar hasCategory />);

    for (const card of screen
      .getByTestId("filter-rail-skeleton")
      .querySelectorAll("[data-section]")) {
      expect(card.outerHTML).toMatch(/\bh-\d+\b/);
    }
  });

  // TASK-2011 — the category tree tops the rail, before the filter cards.
  it("opens the rail with the category tree panel", () => {
    render(<ProductListSkeleton withSidebar />);

    expect(
      screen.getByTestId("filter-rail-skeleton").firstElementChild,
    ).toHaveAttribute("data-testid", "category-tree-skeleton");
  });

  it("leaves out the tree where the route fixes the device", () => {
    render(
      <ProductListSkeleton
        withSidebar
        withCategoryTree={false}
        hasCategory
        lockedDevice
      />,
    );

    expect(
      screen.queryByTestId("category-tree-skeleton"),
    ).not.toBeInTheDocument();
  });

  it("reserves exactly the rows the page says its tree draws", () => {
    const rows = () =>
      screen.getByTestId("category-tree-skeleton").querySelectorAll(".h-9")
        .length;

    render(<ProductListSkeleton withSidebar categoryTreeRows={9} />);
    expect(rows()).toBe(9);
  });

  // Д3-2 Catalog §3 — the count line moved from the results column up under
  // the H1: the shell reserves it on top, the bare results no longer do.
  it("reserves the count line under the H1 in the shell only", () => {
    const { unmount } = render(<ProductListSkeleton withSidebar />);
    const placeholder = screen.getByTestId("result-count-skeleton");
    expect(placeholder.parentElement).toHaveClass("mt-1.5", "min-h-5");
    unmount();

    render(<ProductListSkeleton />);
    expect(screen.queryByTestId("result-count-skeleton")).toBeNull();
  });

  // TASK-869 — a grid cell is shaped like the ProductCard + actions pair, not a
  // bare image and two bars (164px short at 1440, so the skeleton's second row
  // sat where the real first row's price and «Купити» land).
  it("draws every grid cell as a card frame with the card's blocks", () => {
    render(<ProductListSkeleton withSidebar />);

    const cells = screen.getAllByTestId("stock-line-skeleton");
    expect(cells).toHaveLength(12);

    const card = cells[0].closest(".border")!;
    expect(card).toHaveClass(
      "flex",
      "flex-col",
      "overflow-hidden",
      // The ProductCard frame (TASK-2171): role radius + resting shadow.
      "rounded-card",
      "border-border",
      "bg-card",
      "shadow-card",
    );
    // Edge-to-edge square image, as in ProductCard.
    expect(card.firstElementChild).toHaveClass(
      "aspect-square",
      "w-full",
      "rounded-none",
    );
    // The Buy + heart row: two 40px controls, the heart 42px wide.
    const actions = card.querySelectorAll(".h-10");
    expect(actions).toHaveLength(2);
    expect(actions[1]).toHaveClass("w-10.5", "shrink-0");
  });

  // TASK-869 fix round — one variant card stretches its whole grid row by the
  // ColorDots row (14px + the body's 8px gap); on the seeded catalogue that is
  // most rows, so the placeholder reserves it or every row lands 22px lower.
  it("reserves the colour-dots row between the rating and the price", () => {
    render(<ProductListSkeleton />);

    const rows = screen.getAllByTestId("color-dots-skeleton");
    expect(rows).toHaveLength(12);
    // The same row ColorDots draws: 14px swatches, gap-1.5.
    expect(rows[0]).toHaveClass("flex", "items-center", "gap-1.5");
    const dots = rows[0].children;
    expect(dots.length).toBeGreaterThan(0);
    for (const dot of Array.from(dots)) {
      expect(dot).toHaveClass("size-3.5", "rounded-full");
    }
    // It sits in the card body, right before the price pushed down by mt-auto.
    expect(rows[0].nextElementSibling).toHaveClass("mt-auto", "h-7");
  });

  it("sets the stock line in the real copy, so it wraps where the card's does", () => {
    render(<ProductListSkeleton />);

    const line = screen.getAllByTestId("stock-line-skeleton")[0];
    // The same text-xs flex row as ProductCardActions' stock line.
    expect(line).toHaveClass("flex", "items-center", "gap-1.5", "text-xs");
    expect(line).toHaveTextContent(dict.productCard.inStockLine);
    const bar = line.querySelector(".animate-pulse")!;
    expect(bar).toHaveClass("text-transparent", "bg-muted");
  });

  it("renders no rail at all without the sidebar", () => {
    render(<ProductListSkeleton />);

    expect(
      screen.queryByTestId("filter-rail-skeleton"),
    ).not.toBeInTheDocument();
  });
});
