import type { CategoryTreeNodeEntity } from "@/entities/category";
import {
  categoryTreeHref,
  categoryTreeRowCount,
  categoryTreeView,
  subcategoryCount,
} from "./category-tree";

function node(
  slug: string,
  children: CategoryTreeNodeEntity[] = [],
): CategoryTreeNodeEntity {
  return {
    id: `id-${slug}`,
    name: slug,
    slug,
    isActive: true,
    sortOrder: 0,
    updatedAt: "2026-10-01T00:00:00.000Z",
    children,
  };
}

// cases › iphone-cases › magsafe › magsafe-silicone (four levels, as the admin allows)
const tree = [
  node("phones"),
  node("cases", [
    node("iphone-cases", [
      node("silicone"),
      node("magsafe", [node("magsafe-silicone"), node("magsafe-clear")]),
    ]),
    node("android-cases"),
  ]),
  node("chargers"),
];

const slugs = (nodes: CategoryTreeNodeEntity[]) => nodes.map((n) => n.slug);

describe("categoryTreeView", () => {
  it("shows every root and no current node on «Усі товари»", () => {
    const view = categoryTreeView(tree, undefined);
    expect(view.current).toBeNull();
    expect(view.ancestors).toEqual([]);
    expect(slugs(view.level)).toEqual(["phones", "cases", "chargers"]);
  });

  it("treats a slug the public tree does not have as «Усі товари»", () => {
    const view = categoryTreeView(tree, "inactive-or-renamed");
    expect(view.current).toBeNull();
    expect(slugs(view.level)).toEqual(["phones", "cases", "chargers"]);
  });

  it("puts a root on the root level with no ancestors", () => {
    const view = categoryTreeView(tree, "cases");
    expect(view.current?.slug).toBe("cases");
    expect(view.ancestors).toEqual([]);
    expect(slugs(view.level)).toEqual(["phones", "cases", "chargers"]);
  });

  it("walks the active path down to a third-level node and shows its siblings", () => {
    const view = categoryTreeView(tree, "magsafe");
    expect(slugs(view.ancestors)).toEqual(["cases", "iphone-cases"]);
    expect(slugs(view.level)).toEqual(["silicone", "magsafe"]);
    expect(slugs(view.current?.children ?? [])).toEqual([
      "magsafe-silicone",
      "magsafe-clear",
    ]);
  });

  it("reaches the fourth level", () => {
    const view = categoryTreeView(tree, "magsafe-clear");
    expect(slugs(view.ancestors)).toEqual(["cases", "iphone-cases", "magsafe"]);
    expect(slugs(view.level)).toEqual(["magsafe-silicone", "magsafe-clear"]);
  });
});

describe("categoryTreeRowCount", () => {
  it("counts «Усі категорії» plus every root on «Усі товари»", () => {
    expect(categoryTreeRowCount(tree, undefined)).toBe(4);
  });

  it("counts «Усі категорії», ancestors, the level and the current node's children", () => {
    // 1 + 2 ancestors + 2 on the level + 2 children
    expect(categoryTreeRowCount(tree, "magsafe")).toBe(7);
  });
});

describe("subcategoryCount", () => {
  it("is the number of roots on «Усі товари»", () => {
    expect(subcategoryCount(tree, undefined)).toBe(3);
  });

  it("is the current node's children", () => {
    expect(subcategoryCount(tree, "cases")).toBe(2);
  });

  it("is zero on a leaf", () => {
    expect(subcategoryCount(tree, "chargers")).toBe(0);
  });
});

describe("categoryTreeHref", () => {
  const current = new URLSearchParams(
    "view=list&device=iphone-15&sortBy=price&sortOrder=asc&brand=apple&minPrice=100&page=3&specs=x",
  );
  const keep = ["view", "device", "sortBy", "sortOrder"];

  it("links a node to its landing page and keeps only view, device and sort", () => {
    expect(
      categoryTreeHref("magsafe", current, { target: "landing", keep }),
    ).toBe(
      "/categories/magsafe?view=list&device=iphone-15&sortBy=price&sortOrder=asc",
    );
  });

  it("links «Усі категорії» to /products", () => {
    expect(
      categoryTreeHref(undefined, new URLSearchParams(), {
        target: "landing",
        keep,
      }),
    ).toBe("/products");
  });

  it("narrows a listing by ?category= on its own path, with its anchor", () => {
    expect(
      categoryTreeHref("cases", new URLSearchParams("view=list&brand=x"), {
        target: { path: "/promo" },
        keep,
        fragment: "#deals",
      }),
    ).toBe("/promo?view=list&category=cases#deals");
  });

  it("drops the category for «Усі категорії» on a query listing but keeps the search", () => {
    expect(
      categoryTreeHref(
        undefined,
        new URLSearchParams("q=чохол&category=cases"),
        {
          target: { path: "/search" },
          keep: ["q"],
        },
      ),
    ).toBe(`/search?q=${encodeURIComponent("чохол")}`);
  });
});
