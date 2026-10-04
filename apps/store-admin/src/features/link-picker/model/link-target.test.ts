import { dict } from "@/shared/config";
import {
  flattenCategoryPaths,
  resolveLink,
  SITE_SECTIONS,
} from "./link-target";

const tree = [
  {
    id: "c1",
    name: "Захисне скло",
    slug: "screen-protectors",
    isActive: true,
    sortOrder: 0,
    updatedAt: "",
    children: [
      {
        id: "c2",
        name: "для iPhone",
        slug: "glass-iphone",
        isActive: true,
        sortOrder: 0,
        updatedAt: "",
        children: [],
      },
    ],
  },
];

describe("flattenCategoryPaths", () => {
  it("labels every category with its path from the root", () => {
    expect(flattenCategoryPaths(tree)).toEqual([
      { id: "c1", slug: "screen-protectors", label: "Захисне скло" },
      { id: "c2", slug: "glass-iphone", label: "Захисне скло → для iPhone" },
    ]);
  });
});

describe("resolveLink", () => {
  const categories = flattenCategoryPaths(tree);

  it("an empty address is no link at all", () => {
    expect(resolveLink("  ", categories)).toBeNull();
  });

  it("recognises a site section, with its note", () => {
    expect(resolveLink("/products", categories)).toEqual({
      kind: "section",
      label: dict.linkPicker.sectionCatalog,
      note: dict.linkPicker.noteCatalog,
    });
    expect(SITE_SECTIONS.map((s) => s.href)).toContain("/promo");
  });

  it("names a category by its path, or falls back to the slug", () => {
    expect(resolveLink("/categories/glass-iphone", categories)).toEqual({
      kind: "category",
      label: "Захисне скло → для iPhone",
    });
    expect(resolveLink("/categories/unknown", categories)).toEqual({
      kind: "category",
      label: "unknown",
    });
  });

  it("names a product by a remembered name, or by its slug", () => {
    expect(resolveLink("/products/case-1", categories)).toEqual({
      kind: "product",
      label: "case-1",
    });
    expect(
      resolveLink(
        "/products/case-1",
        categories,
        new Map([["/products/case-1", "Чохол MagSafe"]]),
      ),
    ).toEqual({ kind: "product", label: "Чохол MagSafe" });
  });

  it("anything else stays «Своє», untouched", () => {
    expect(resolveLink("https://example.com/x?y=1", categories)).toEqual({
      kind: "custom",
      label: "https://example.com/x?y=1",
    });
    expect(resolveLink("/categories/a/b", categories)?.kind).toBe("custom");
  });
});
