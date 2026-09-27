import type { CategoryTreeNodeEntity } from "@/entities/category";
import { findCategoryIdBySlug } from "./find-category";

function node(
  id: string,
  slug: string,
  children: CategoryTreeNodeEntity[] = [],
): CategoryTreeNodeEntity {
  return {
    id,
    slug,
    name: slug,
    children,
  } as unknown as CategoryTreeNodeEntity;
}

const TREE = [
  node("root-cases", "cases", [node("leaf-iphone", "iphone-cases")]),
  node("root-power", "power"),
];

describe("findCategoryIdBySlug (TASK-523)", () => {
  it("finds a root", () => {
    expect(findCategoryIdBySlug(TREE, "power")).toBe("root-power");
  });

  it("finds a subcategory", () => {
    expect(findCategoryIdBySlug(TREE, "iphone-cases")).toBe("leaf-iphone");
  });

  it("is undefined for an unknown slug", () => {
    expect(findCategoryIdBySlug(TREE, "nope")).toBeUndefined();
    expect(findCategoryIdBySlug([], "cases")).toBeUndefined();
  });
});
