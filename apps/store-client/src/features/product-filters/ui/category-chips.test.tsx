import { useState } from "react";
import { renderWithProviders, screen, userEvent } from "@/shared/test/render";
import { dict } from "@/shared/config";
import type { CategoryTreeNodeEntity } from "@/entities/category";
import { CategoryChips } from "./category-chips";

/**
 * Build a tree node; leaf nodes have an empty `children` array.
 *
 * The id is deliberately NOT the slug (TASK-420): the chips row is addressed by
 * slug now, and a fixture where the two coincide would pass just as happily if
 * the component went back to reading ids.
 */
function node(
  slug: string,
  name: string,
  children: CategoryTreeNodeEntity[] = [],
): CategoryTreeNodeEntity {
  return {
    id: `${slug}-uuid`,
    name,
    slug,
    description: null,
    image: null,
    isActive: true,
    sortOrder: 0,
    updatedAt: "2026-07-01T00:00:00.000Z",
    children,
  };
}

const TREE: CategoryTreeNodeEntity[] = [
  node("cases", "Чохли", [
    node("iphone-cases", "Чохли iPhone"),
    node("samsung-cases", "Чохли Samsung"),
  ]),
  node("chargers", "Зарядні"),
];

/**
 * Mirrors the real URL round-trip: the slug CategoryChips emits via `onSelect`
 * is fed straight back as `activeCategorySlug`, exactly as `router.replace` →
 * `?category=` → `params.category` does in production (TASK-420).
 */
function Harness({ initial }: { initial?: string }) {
  const [active, setActive] = useState<string | undefined>(initial);
  return (
    <CategoryChips
      categories={TREE}
      activeCategorySlug={active}
      onSelect={setActive}
    />
  );
}

const subRow = () =>
  screen.queryByRole("group", { name: dict.filters.subcategoryChipsAria });

describe("CategoryChips — two-level disclosure (TASK-236)", () => {
  it("renders the root chips and no subcategory row initially", () => {
    renderWithProviders(<Harness />);

    expect(screen.getByRole("button", { name: "Чохли" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Зарядні" })).toBeInTheDocument();
    expect(subRow()).not.toBeInTheDocument();
  });

  it("reveals the direct children when a root chip is selected", async () => {
    renderWithProviders(<Harness />);

    await userEvent.click(screen.getByRole("button", { name: "Чохли" }));

    expect(subRow()).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Чохли iPhone" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Чохли Samsung" }),
    ).toBeInTheDocument();
  });

  it("selecting a child marks it pressed and keeps the row open (child slug in URL)", async () => {
    renderWithProviders(<Harness />);

    await userEvent.click(screen.getByRole("button", { name: "Чохли" }));
    await userEvent.click(screen.getByRole("button", { name: "Чохли iPhone" }));

    const childChip = screen.getByRole("button", { name: "Чохли iPhone" });
    expect(childChip).toHaveAttribute("aria-pressed", "true");
    // Root chip is no longer the pressed one, but its child row stays visible.
    expect(screen.getByRole("button", { name: "Чохли" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
    expect(subRow()).toBeInTheDocument();
  });

  it("shows the child row on mount when a subcategory is the active URL param", () => {
    renderWithProviders(<Harness initial="samsung-cases" />);

    expect(subRow()).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Чохли Samsung" }),
    ).toHaveAttribute("aria-pressed", "true");
  });

  it("clearing via «Всі категорії» hides the subcategory row", async () => {
    renderWithProviders(<Harness initial="iphone-cases" />);
    expect(subRow()).toBeInTheDocument();

    await userEvent.click(
      screen.getByRole("button", { name: dict.filters.allCategories }),
    );

    expect(subRow()).not.toBeInTheDocument();
  });

  it("a standalone root with no children reveals no subcategory row", async () => {
    renderWithProviders(<Harness />);

    await userEvent.click(screen.getByRole("button", { name: "Зарядні" }));

    expect(subRow()).not.toBeInTheDocument();
  });
});
