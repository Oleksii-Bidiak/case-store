import { render, screen } from "@/shared/test/render";
import { filterRailSections } from "@/features/product-filters";
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

  it("mirrors the default /products rail, «Знижки» included", () => {
    render(<ProductListSkeleton withSidebar />);

    expect(railSections()).toEqual(filterRailSections());
    expect(railSections()).toContain("onSale");
    expect(railSections()).not.toContain("specs");
  });

  it("reserves «Характеристики» once a category is set", () => {
    render(<ProductListSkeleton withSidebar hasCategory />);

    expect(railSections()).toEqual(filterRailSections({ hasCategory: true }));
    expect(railSections().at(-1)).toBe("specs");
  });

  it("drops the device card where the route fixes the device", () => {
    render(<ProductListSkeleton withSidebar hasCategory lockedDevice />);

    expect(railSections()).toEqual(
      filterRailSections({ hasCategory: true, lockedDevice: true }),
    );
  });

  it("drops «Знижки» on /promo, where the route fixes the discount", () => {
    render(<ProductListSkeleton withSidebar lockedOnSale />);

    expect(railSections()).toEqual(filterRailSections({ lockedOnSale: true }));
    expect(railSections()).not.toContain("onSale");
  });

  it("gives every card a height, so no section collapses to zero", () => {
    render(<ProductListSkeleton withSidebar hasCategory />);

    for (const card of screen
      .getByTestId("filter-rail-skeleton")
      .querySelectorAll("[data-section]")) {
      expect(card.className).toMatch(/\bh-\d+\b/);
    }
  });

  it("leaves out the category chips row where the route locks the category", () => {
    const { container: withChips } = render(
      <ProductListSkeleton withSidebar />,
    );
    const { container: locked } = render(
      <ProductListSkeleton withSidebar withCategoryChips={false} hasCategory />,
    );

    const chips = (root: HTMLElement) =>
      root.querySelectorAll(".rounded-full.h-9, .h-9.rounded-full");
    expect(chips(withChips).length).toBeGreaterThan(0);
    expect(chips(locked)).toHaveLength(0);
  });

  it("reserves the subcategory chips row only when the page says there is one", () => {
    const rows = () =>
      screen.getByTestId("category-chips-skeleton").children.length;

    const { unmount } = render(<ProductListSkeleton withSidebar />);
    expect(rows()).toBe(1);
    unmount();

    render(<ProductListSkeleton withSidebar withSubcategoryChips />);
    expect(rows()).toBe(2);
  });

  // TASK-869 — the count line sits in the results column in every variant,
  // the rail-less one (`ProductList`'s own pending state) and the list view.
  it.each([
    ["the sidebar shell", { withSidebar: true }],
    ["the bare results", {}],
    ["the list view", { view: "list" as const }],
  ])("reserves the result-count line in %s", (_label, props) => {
    render(<ProductListSkeleton {...props} />);

    expect(screen.getByTestId("result-count-skeleton")).toHaveClass("h-5");
  });

  it("renders no rail at all without the sidebar", () => {
    render(<ProductListSkeleton />);

    expect(
      screen.queryByTestId("filter-rail-skeleton"),
    ).not.toBeInTheDocument();
  });
});
