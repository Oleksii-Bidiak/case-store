import type { CategoryTreeNodeEntity } from "@/entities/category";
import { subcategoryChipsOf } from "./category-chips";

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

const tree = [
  node("cases", [node("iphone-cases"), node("samsung-cases")]),
  node("gift-cards"),
];

/** TASK-515 — the one rule for the second chips row, chips and skeleton alike. */
describe("subcategoryChipsOf", () => {
  it("is empty with no category selected", () => {
    expect(subcategoryChipsOf(tree, undefined)).toEqual([]);
  });

  it("lists a selected root's children", () => {
    expect(subcategoryChipsOf(tree, "cases").map((c) => c.slug)).toEqual([
      "iphone-cases",
      "samsung-cases",
    ]);
  });

  it("keeps the siblings on screen when a child is selected", () => {
    expect(
      subcategoryChipsOf(tree, "samsung-cases").map((c) => c.slug),
    ).toEqual(["iphone-cases", "samsung-cases"]);
  });

  it("is empty for a childless root or an unknown slug", () => {
    expect(subcategoryChipsOf(tree, "gift-cards")).toEqual([]);
    expect(subcategoryChipsOf(tree, "nope")).toEqual([]);
    expect(subcategoryChipsOf([], "cases")).toEqual([]);
  });
});
