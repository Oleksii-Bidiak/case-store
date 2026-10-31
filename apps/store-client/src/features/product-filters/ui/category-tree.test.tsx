import { useState } from "react";
import type { CategoryTreeNodeEntity } from "@/entities/category";
import {
  renderWithProviders,
  screen,
  userEvent,
  within,
} from "@/shared/test/render";
import { dict } from "@/shared/config";
import { CategoryTreePanel } from "./category-tree-panel";
import { CategoryTreeSheet } from "./category-tree-sheet";

// A plain anchor: the tree's nodes are links, and the test only needs to see
// where they point and that following one reports back (no app router here).
jest.mock("next/link", () => {
  const { createElement } = jest.requireActual<typeof import("react")>("react");
  return {
    __esModule: true,
    default: ({
      href,
      onClick,
      ...rest
    }: {
      href: string;
      onClick?: () => void;
      children: React.ReactNode;
    }) =>
      createElement("a", {
        ...rest,
        href,
        onClick: (event: MouseEvent) => {
          event.preventDefault();
          onClick?.();
        },
      }),
  };
});

function node(
  slug: string,
  name: string,
  children: CategoryTreeNodeEntity[] = [],
): CategoryTreeNodeEntity {
  return {
    id: `id-${slug}`,
    name,
    slug,
    isActive: true,
    sortOrder: 0,
    updatedAt: "2026-10-01T00:00:00.000Z",
    children,
  };
}

const tree = [
  node("phones", "Смартфони"),
  node("cases", "Чохли", [
    node("iphone-cases", "Чохли для iPhone", [
      node("silicone", "Силіконові", [node("silicone-soft", "М'які")]),
      node("magsafe", "З MagSafe", [
        node("magsafe-silicone", "Силіконові з MagSafe"),
        node("magsafe-clear", "Прозорі з MagSafe"),
      ]),
    ]),
    node("android-cases", "Чохли для Android"),
  ]),
  node("chargers", "Зарядні пристрої"),
];

const hrefFor = (slug: string | undefined) =>
  slug ? `/categories/${slug}` : "/products";

const treeNav = () =>
  screen.getByRole("navigation", { name: dict.filters.categoryTreeTitle });

describe("CategoryTreePanel — rows and the active path", () => {
  it("makes «Усі категорії» current on «Усі товари» and lists every root as a link", () => {
    renderWithProviders(
      <CategoryTreePanel categories={tree} hrefFor={hrefFor} />,
    );

    const all = within(treeNav()).getByRole("link", {
      name: dict.filters.allCategories,
    });
    expect(all).toHaveAttribute("aria-current", "page");
    expect(all).toHaveAttribute("href", "/products");
    expect(
      within(treeNav()).getByRole("link", { name: "Зарядні пристрої" }),
    ).toHaveAttribute("href", "/categories/chargers");
    // A root with children is collapsed until asked: its children are in the
    // HTML (crawlable) but not shown.
    expect(
      screen.queryByRole("link", { name: "Чохли для iPhone" }),
    ).not.toBeInTheDocument();
  });

  it("walks a third-level category: ancestors, its level, the current node opened", () => {
    renderWithProviders(
      <CategoryTreePanel
        categories={tree}
        currentSlug="magsafe"
        hrefFor={hrefFor}
      />,
    );
    const nav = within(treeNav());
    const names = nav.getAllByRole("link").map((link) => link.textContent);

    expect(names).toEqual([
      dict.filters.allCategories,
      "Чохли",
      "Чохли для iPhone",
      "Силіконові",
      "З MagSafe",
      "Силіконові з MagSafe",
      "Прозорі з MagSafe",
    ]);
    expect(nav.getByRole("link", { name: "З MagSafe" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(
      nav.getByRole("link", { name: dict.filters.allCategories }),
    ).not.toHaveAttribute("aria-current");
    expect(nav.getByRole("link", { name: "Чохли" })).toHaveAttribute(
      "href",
      "/categories/cases",
    );
    // The current node is always open — it has no disclosure of its own.
    expect(
      nav.queryByRole("button", {
        name: dict.filters.categoryTreeExpand("З MagSafe"),
      }),
    ).not.toBeInTheDocument();
  });
});

describe("CategoryTreePanel — expand / collapse", () => {
  it("opens a sibling's children in place and closes them again", async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <CategoryTreePanel
        categories={tree}
        currentSlug="magsafe"
        hrefFor={hrefFor}
      />,
    );

    const toggle = screen.getByRole("button", {
      name: dict.filters.categoryTreeExpand("Силіконові"),
    });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(
      screen.queryByRole("link", { name: "М'які" }),
    ).not.toBeInTheDocument();

    await user.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    expect(toggle).toHaveAccessibleName(
      dict.filters.categoryTreeCollapse("Силіконові"),
    );
    const child = screen.getByRole("link", { name: "М'які" });
    expect(child).toHaveAttribute("href", "/categories/silicone-soft");
    // The disclosure controls the list it opened.
    expect(
      document.getElementById(toggle.getAttribute("aria-controls")!),
    ).toContainElement(child);

    await user.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(
      screen.queryByRole("link", { name: "М'які" }),
    ).not.toBeInTheDocument();
  });

  it("starts over when the page moves to another category", async () => {
    const user = userEvent.setup();
    const { rerender } = renderWithProviders(
      <CategoryTreePanel categories={tree} hrefFor={hrefFor} />,
    );
    await user.click(
      screen.getByRole("button", {
        name: dict.filters.categoryTreeExpand("Чохли"),
      }),
    );
    expect(
      screen.getByRole("link", { name: "Чохли для Android" }),
    ).toBeInTheDocument();

    rerender(
      <CategoryTreePanel
        categories={tree}
        currentSlug="chargers"
        hrefFor={hrefFor}
      />,
    );
    expect(
      screen.getByRole("button", {
        name: dict.filters.categoryTreeExpand("Чохли"),
      }),
    ).toHaveAttribute("aria-expanded", "false");
  });
});

describe("CategoryTreePanel — keyboard", () => {
  it("reaches each link and disclosure by Tab and toggles with Enter and Space", async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <CategoryTreePanel categories={tree} hrefFor={hrefFor} />,
    );

    await user.tab();
    expect(
      screen.getByRole("link", { name: dict.filters.allCategories }),
    ).toHaveFocus();
    await user.tab();
    expect(screen.getByRole("link", { name: "Смартфони" })).toHaveFocus();
    await user.tab();
    expect(screen.getByRole("link", { name: "Чохли" })).toHaveFocus();
    await user.tab();
    const toggle = screen.getByRole("button", {
      name: dict.filters.categoryTreeExpand("Чохли"),
    });
    expect(toggle).toHaveFocus();

    await user.keyboard("{Enter}");
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    // The opened children come next in the tab order.
    await user.tab();
    expect(
      screen.getByRole("link", { name: "Чохли для iPhone" }),
    ).toHaveFocus();

    await user.tab({ shift: true });
    await user.keyboard(" ");
    expect(toggle).toHaveAttribute("aria-expanded", "false");
  });
});

function SheetHarness({
  currentSlug,
  resultCount = 12,
}: {
  currentSlug?: string;
  resultCount?: number;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <p>{open ? "sheet open" : "sheet closed"}</p>
      <CategoryTreeSheet
        open={open}
        onOpenChange={setOpen}
        categories={tree}
        currentSlug={currentSlug}
        hrefFor={hrefFor}
        resultCount={resultCount}
      />
    </>
  );
}

describe("CategoryTreeSheet — the same tree below lg", () => {
  it("counts the current category's children on its button, or names the panel on a leaf", () => {
    const { unmount } = renderWithProviders(
      <SheetHarness currentSlug="cases" />,
    );
    expect(
      screen.getByRole("button", { name: dict.filters.subcategoriesButton(2) }),
    ).toBeInTheDocument();
    unmount();

    renderWithProviders(<SheetHarness currentSlug="chargers" />);
    expect(
      screen.getByRole("button", { name: dict.filters.categoryTreeTitle }),
    ).toBeInTheDocument();
  });

  it("opens the tree in a dialog and closes when a node is followed", async () => {
    const user = userEvent.setup();
    renderWithProviders(<SheetHarness currentSlug="cases" />);

    await user.click(
      screen.getByRole("button", { name: dict.filters.subcategoriesButton(2) }),
    );
    // TASK-2139: the sheet is named «Підкатегорії» (its visible title stays
    // «Категорія»), and its round close button is «Закрити».
    const dialog = screen.getByRole("dialog", {
      name: dict.sheets.subcategoriesAria,
    });
    expect(dict.sheets.subcategoriesAria).toBe("Підкатегорії");
    expect(
      within(dialog).getByRole("heading", {
        name: dict.filters.categoryTreeTitle,
      }),
    ).toBeInTheDocument();
    expect(
      within(dialog).getByRole("button", { name: "Закрити" }),
    ).toBeInTheDocument();
    expect(within(dialog).getByRole("link", { name: "Чохли" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(
      within(dialog).getByRole("button", {
        name: dict.filters.mobileApply(12),
      }),
    ).toBeInTheDocument();

    await user.click(
      within(dialog).getByRole("link", { name: "Чохли для Android" }),
    );
    expect(screen.getByText("sheet closed")).toBeInTheDocument();
  });

  it("closes on Escape and says when nothing matches", async () => {
    const user = userEvent.setup();
    renderWithProviders(<SheetHarness resultCount={0} />);

    await user.click(
      screen.getByRole("button", { name: dict.filters.subcategoriesButton(3) }),
    );
    expect(
      screen.getByRole("button", { name: dict.filters.subcategoriesNothing }),
    ).toBeInTheDocument();

    await user.keyboard("{Escape}");
    expect(screen.getByText("sheet closed")).toBeInTheDocument();
  });
});
