import { renderWithProviders, screen } from "@/shared/test/render";
import type { CategoryTreeNodeEntity } from "@/entities/category";
import { SubcategoryChips } from "./subcategory-chips";

function node(slug: string, name: string): CategoryTreeNodeEntity {
  return {
    id: `id-${slug}`,
    name,
    slug,
    isActive: true,
    sortOrder: 0,
    updatedAt: "2026-07-01T00:00:00.000Z",
    children: [],
  };
}

describe("SubcategoryChips", () => {
  it("renders one navigation link per child with the landing-page href", () => {
    renderWithProviders(
      <SubcategoryChips
        categories={[
          node("iphone-cases", "Чохли iPhone"),
          node("samsung-cases", "Чохли Samsung"),
        ]}
      />,
    );

    const links = screen.getAllByRole("link");
    expect(links).toHaveLength(2);
    expect(screen.getByRole("link", { name: "Чохли iPhone" })).toHaveAttribute(
      "href",
      "/categories/iphone-cases",
    );
    expect(screen.getByRole("link", { name: "Чохли Samsung" })).toHaveAttribute(
      "href",
      "/categories/samsung-cases",
    );
  });

  it("renders nothing (no wrapper element) for an empty children list", () => {
    const { container } = renderWithProviders(
      <SubcategoryChips categories={[]} />,
    );

    expect(container).toBeEmptyDOMElement();
  });
});
