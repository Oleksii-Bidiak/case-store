import type { CategoryTreeNodeEntity } from "@/shared/api/generated/models";
import { dict } from "@/shared/config";
import {
  buildCatalogHeader,
  findCategoryName,
  findCategoryPathBySlug,
} from "./catalog-header";

function node(
  id: string,
  name: string,
  children: CategoryTreeNodeEntity[] = [],
): CategoryTreeNodeEntity {
  return {
    id,
    name,
    slug: name.toLowerCase(),
    isActive: true,
    sortOrder: 0,
    updatedAt: "2026-07-01T00:00:00.000Z",
    children,
  };
}

const tree: CategoryTreeNodeEntity[] = [
  node("root-1", "Смартфони та гаджети", [
    node("cat-phones", "Смартфони"),
    node("cat-audio", "Аудіо", [node("cat-headphones", "Навушники")]),
  ]),
  node("root-2", "Аксесуари"),
];

describe("findCategoryName", () => {
  it("finds a nested sub-category by id", () => {
    expect(findCategoryName(tree, "cat-phones")).toBe("Смартфони");
  });

  it("finds a root category by id", () => {
    expect(findCategoryName(tree, "root-2")).toBe("Аксесуари");
  });

  it("returns null for an unknown id", () => {
    expect(findCategoryName(tree, "missing")).toBeNull();
  });
});

describe("findCategoryPathBySlug", () => {
  it("returns a single-element path for a root-level match", () => {
    const path = findCategoryPathBySlug(tree, "аксесуари");

    expect(path?.map((n) => n.id)).toEqual(["root-2"]);
  });

  it("returns the full ancestor chain in root-to-leaf order for a 2-level match", () => {
    const path = findCategoryPathBySlug(tree, "смартфони");

    expect(path?.map((n) => n.id)).toEqual(["root-1", "cat-phones"]);
  });

  it("returns the full ancestor chain in root-to-leaf order for a 3-level match", () => {
    const path = findCategoryPathBySlug(tree, "навушники");

    expect(path?.map((n) => n.id)).toEqual([
      "root-1",
      "cat-audio",
      "cat-headphones",
    ]);
  });

  it("returns null for an unknown slug", () => {
    expect(findCategoryPathBySlug(tree, "missing-slug")).toBeNull();
  });
});

describe("buildCatalogHeader", () => {
  it("builds a category-scoped trail linking the categories hub", () => {
    const header = buildCatalogHeader({
      categoryId: "cat-phones",
      categoryName: "Смартфони",
      search: undefined,
    });

    expect(header.title).toBe("Смартфони");
    expect(header.trail.map((c) => c.name)).toEqual([
      dict.catalog.breadcrumbHome,
      dict.catalog.breadcrumbCategories,
      "Смартфони",
    ]);
    // The mid crumb points at the categories hub; the last crumb is current.
    expect(header.trail[1].href).toBe("/categories");
    expect(header.trail[2].href).toBeUndefined();
    expect(header.currentPath).toBe("/products?categoryId=cat-phones");
  });

  it("falls back to a generic label when the category name is unresolved", () => {
    const header = buildCatalogHeader({
      categoryId: "cat-x",
      categoryName: null,
      search: undefined,
    });

    expect(header.title).toBe(dict.catalog.categoryFallback);
    expect(header.trail[2].name).toBe(dict.catalog.categoryFallback);
  });

  it("builds a search trail under the catalog", () => {
    const header = buildCatalogHeader({
      categoryName: null,
      search: "iphone",
    });

    expect(header.title).toBe(dict.catalog.searchTitle("iphone"));
    expect(header.trail.map((c) => c.name)).toEqual([
      dict.catalog.breadcrumbHome,
      dict.catalog.breadcrumbProducts,
      "«iphone»",
    ]);
    expect(header.currentPath).toBe("/products?search=iphone");
  });

  it("builds the plain all-products trail with no trailing link", () => {
    const header = buildCatalogHeader({ categoryName: null });

    expect(header.title).toBe(dict.catalog.allProducts);
    expect(header.trail).toHaveLength(2);
    expect(header.trail[1].name).toBe(dict.catalog.breadcrumbProducts);
    expect(header.trail[1].href).toBeUndefined();
    expect(header.currentPath).toBe("/products");
  });
});
