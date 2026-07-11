import type { CategoryTreeNodeEntity } from "@/shared/api/generated/models";
import { flattenActiveCategories } from "./fetchAllCategories";

function node(
  slug: string,
  updatedAt: string,
  children: CategoryTreeNodeEntity[] = [],
): CategoryTreeNodeEntity {
  return {
    id: `id-${slug}`,
    name: slug,
    slug,
    isActive: true,
    sortOrder: 0,
    updatedAt,
    children,
  };
}

describe("flattenActiveCategories", () => {
  it("flattens a 3-level nested tree into a flat list in tree order", () => {
    const tree = [
      node("cases", "2026-07-01T00:00:00.000Z", [
        node("iphone-cases", "2026-07-02T00:00:00.000Z", [
          node("iphone-15-cases", "2026-07-03T00:00:00.000Z"),
        ]),
        node("samsung-cases", "2026-07-04T00:00:00.000Z"),
      ]),
      node("chargers", "2026-07-05T00:00:00.000Z"),
    ];

    expect(flattenActiveCategories(tree)).toEqual([
      { slug: "cases", updatedAt: "2026-07-01T00:00:00.000Z" },
      { slug: "iphone-cases", updatedAt: "2026-07-02T00:00:00.000Z" },
      { slug: "iphone-15-cases", updatedAt: "2026-07-03T00:00:00.000Z" },
      { slug: "samsung-cases", updatedAt: "2026-07-04T00:00:00.000Z" },
      { slug: "chargers", updatedAt: "2026-07-05T00:00:00.000Z" },
    ]);
  });

  it("returns an empty list for an empty tree", () => {
    expect(flattenActiveCategories([])).toEqual([]);
  });

  it("tolerates a node without a children array", () => {
    const leaf = node("cables", "2026-07-06T00:00:00.000Z");
    // The generated model always carries `children`, but the flatten must not
    // blow up if a payload ever omits it on leaves.
    delete (leaf as Partial<CategoryTreeNodeEntity>).children;

    expect(flattenActiveCategories([leaf])).toEqual([
      { slug: "cables", updatedAt: "2026-07-06T00:00:00.000Z" },
    ]);
  });
});
