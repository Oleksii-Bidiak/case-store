import { render, screen } from "@/shared/test/render";
import { dict } from "@/shared/config";
import type { CategoryTreeNodeEntity } from "@/entities/category";
import { CategoryChips } from "./category-chips";
import { CategoryChipsSkeleton } from "./category-chips-skeleton";

const node = (
  slug: string,
  children: CategoryTreeNodeEntity[] = [],
): CategoryTreeNodeEntity =>
  ({
    id: slug,
    slug,
    name: slug,
    children,
  }) as unknown as CategoryTreeNodeEntity;

const tree = [node("cases", [node("iphone-cases")]), node("chargers")];

/**
 * TASK-515 — the placeholder stands in for the chips in the catalogue skeleton
 * and in `ProductListView` before the tree is there, so it must be the same box
 * row for row, or the toolbar and the grid move when the chips land.
 */
describe("CategoryChipsSkeleton — the same box as CategoryChips", () => {
  const rowsOf = (root: Element) => [...root.children];

  it.each([
    ["the root row alone", undefined, false],
    ["the root row and the subcategory row", "iphone-cases", true],
  ])("matches %s", (_label, activeSlug, withSubcategories) => {
    const { unmount } = render(
      <CategoryChips
        categories={tree}
        activeCategorySlug={activeSlug}
        onSelect={jest.fn()}
      />,
    );
    const real = screen.getByRole("group", {
      name: dict.filters.categoryChipsAria,
    }).parentElement!;
    const realClass = real.className;
    const realRows = rowsOf(real).map((row) => ({
      pb: row.classList.contains("pb-1"),
      gap: row.classList.contains("gap-2"),
      pl: row.classList.contains("pl-1"),
      chipHeight: row.firstElementChild!.classList.contains("h-9"),
    }));
    unmount();

    render(<CategoryChipsSkeleton withSubcategories={withSubcategories} />);
    const placeholder = screen.getByTestId("category-chips-skeleton");

    expect(placeholder.className).toBe(realClass);
    expect(
      rowsOf(placeholder).map((row) => ({
        pb: row.classList.contains("pb-1"),
        gap: row.classList.contains("gap-2"),
        pl: row.classList.contains("pl-1"),
        chipHeight: row.firstElementChild!.classList.contains("h-9"),
      })),
    ).toEqual(realRows);
  });

  it("is hidden from assistive tech", () => {
    render(<CategoryChipsSkeleton />);

    expect(screen.getByTestId("category-chips-skeleton")).toHaveAttribute(
      "aria-hidden",
      "true",
    );
  });
});
