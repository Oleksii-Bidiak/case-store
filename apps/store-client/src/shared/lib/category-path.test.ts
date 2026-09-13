import {
  buildCategoryPathMap,
  formatCategoryPath,
  CATEGORY_PATH_SEPARATOR,
  type CategoryPathNode,
} from "./category-path";

/** Two roots, one of them two levels deep — the shape the real tree has. */
const tree: CategoryPathNode[] = [
  {
    id: "accessories",
    name: "Аксесуари",
    children: [
      { id: "cases", name: "Чохли", children: [] },
      {
        id: "cables",
        name: "Кабелі та адаптери",
        children: [{ id: "usb-c", name: "USB-C", children: [] }],
      },
    ],
  },
  { id: "phones", name: "Смартфони", children: [] },
];

describe("buildCategoryPathMap", () => {
  it("maps a root category to a single-segment path", () => {
    expect(buildCategoryPathMap(tree).get("phones")).toEqual(["Смартфони"]);
    expect(buildCategoryPathMap(tree).get("accessories")).toEqual([
      "Аксесуари",
    ]);
  });

  it("maps a child to the full root-to-leaf path", () => {
    expect(buildCategoryPathMap(tree).get("cases")).toEqual([
      "Аксесуари",
      "Чохли",
    ]);
  });

  it("maps a grandchild through every ancestor, in root-to-leaf order", () => {
    expect(buildCategoryPathMap(tree).get("usb-c")).toEqual([
      "Аксесуари",
      "Кабелі та адаптери",
      "USB-C",
    ]);
  });

  it("covers every node in the forest exactly once", () => {
    expect(buildCategoryPathMap(tree).size).toBe(5);
  });

  it("returns an empty map for an empty, null, or undefined forest", () => {
    expect(buildCategoryPathMap([]).size).toBe(0);
    expect(buildCategoryPathMap(null).size).toBe(0);
    expect(buildCategoryPathMap(undefined).size).toBe(0);
  });

  it("tolerates a node with no children key at all", () => {
    const map = buildCategoryPathMap([{ id: "a", name: "A" }]);
    expect(map.get("a")).toEqual(["A"]);
  });

  it("yields undefined for an id that is not in the tree", () => {
    expect(buildCategoryPathMap(tree).get("nope")).toBeUndefined();
  });

  it("terminates on a cyclic tree instead of recursing forever", () => {
    const parent: CategoryPathNode = { id: "p", name: "P", children: [] };
    const child: CategoryPathNode = { id: "c", name: "C", children: [parent] };
    parent.children = [child];

    const map = buildCategoryPathMap([parent]);

    expect(map.get("p")).toEqual(["P"]);
    expect(map.get("c")).toEqual(["P", "C"]);
    expect(map.size).toBe(2);
  });

  it("keeps the first path when the same id appears twice in the forest", () => {
    const map = buildCategoryPathMap([
      { id: "root", name: "Перший", children: [{ id: "dup", name: "Один" }] },
      { id: "other", name: "Другий", children: [{ id: "dup", name: "Два" }] },
    ]);
    expect(map.get("dup")).toEqual(["Перший", "Один"]);
  });
});

describe("formatCategoryPath", () => {
  it("joins segments with Google's ' > ' delimiter by default", () => {
    expect(formatCategoryPath(["Аксесуари", "Чохли"])).toBe(
      "Аксесуари > Чохли",
    );
    expect(CATEGORY_PATH_SEPARATOR).toBe(" > ");
  });

  it("renders a single-segment path without a separator", () => {
    expect(formatCategoryPath(["Смартфони"])).toBe("Смартфони");
  });

  it("accepts a custom separator", () => {
    expect(formatCategoryPath(["A", "B"], " / ")).toBe("A / B");
  });

  it("returns undefined for an empty, null, or undefined path", () => {
    expect(formatCategoryPath([])).toBeUndefined();
    expect(formatCategoryPath(null)).toBeUndefined();
    expect(formatCategoryPath(undefined)).toBeUndefined();
  });

  it("drops blank segments and returns undefined when nothing survives", () => {
    expect(formatCategoryPath(["  ", "Чохли"])).toBe("Чохли");
    expect(formatCategoryPath(["  ", ""])).toBeUndefined();
  });

  it("trims each segment so the delimiter stays exact", () => {
    expect(formatCategoryPath(["  Аксесуари ", " Чохли  "])).toBe(
      "Аксесуари > Чохли",
    );
  });
});
