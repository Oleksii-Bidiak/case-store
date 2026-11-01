import type { CategoryTreeItem } from "@/entities/category";

import {
  buildIconPreviewRows,
  filterCategoryIcons,
  iconPreviewTiles,
  usedRootIcons,
} from "./icon-picker-model";

function item(
  id: string,
  parentId: string | null,
  icon: string | null,
  count = 10,
): CategoryTreeItem {
  return {
    id,
    parentId,
    label: id.toUpperCase(),
    slug: id,
    isActive: true,
    productCount: count,
    subtreeProductCount: count,
    depth: parentId ? 2 : 1,
    icon,
  };
}

const TREE = [
  item("cases", null, "cases", 412),
  item("iphone-cases", "cases", null, 214),
  item("glass", null, "glass", 188),
  item("chargers", null, null, 74),
  item("cables", null, "cables", 96),
  item("memory", null, null, 18),
  item("audio", null, "cases", 5),
];

describe("filterCategoryIcons (TASK-1956)", () => {
  it("returns every key for an empty query", () => {
    expect(filterCategoryIcons("  ")).toHaveLength(11);
  });

  it("matches the Ukrainian label and the English key, case-insensitively", () => {
    expect(filterCategoryIcons("ЗАРЯД")).toEqual(["chargers"]);
    expect(filterCategoryIcons("charger")).toEqual(["chargers"]);
    expect(filterCategoryIcons("кабель")).toEqual(["cables"]);
  });

  it("finds nothing for a word outside the set", () => {
    expect(filterCategoryIcons("ракета")).toEqual([]);
  });
});

describe("usedRootIcons (TASK-1956)", () => {
  it("collects other roots' icons only — never subcategories or the edited one", () => {
    expect([...usedRootIcons(TREE, "cases")].sort()).toEqual([
      "cables",
      "cases",
      "glass",
    ]);
    expect(usedRootIcons(TREE, "audio").has("cases")).toBe(true);
    expect(usedRootIcons([TREE[0]], "cases").size).toBe(0);
  });
});

describe("buildIconPreviewRows (TASK-1956)", () => {
  const base = {
    items: TREE,
    parentId: "",
    name: "Зарядні пристрої",
    icon: "chargers",
    fallbackName: "Нова категорія",
  };

  it("shows up to four siblings around the edited one with its live name and icon", () => {
    const rows = buildIconPreviewRows({ ...base, editedId: "chargers" });
    expect(rows.map((r) => r.id)).toEqual([
      "cases",
      "glass",
      "chargers",
      "cables",
    ]);
    expect(rows[2]).toEqual({
      id: "chargers",
      name: "Зарядні пристрої",
      icon: "chargers",
      count: 74,
      current: true,
    });
    // The other rows keep their own icons.
    expect(rows.map((r) => r.icon)).toEqual([
      "cases",
      "glass",
      "chargers",
      "cables",
    ]);
  });

  it("appends a new category at the end, without a count", () => {
    const rows = buildIconPreviewRows({
      ...base,
      editedId: undefined,
      name: "",
      icon: "",
    });
    expect(rows).toHaveLength(4);
    expect(rows[3]).toEqual({
      id: "new",
      name: "Нова категорія",
      icon: null,
      count: null,
      current: true,
    });
  });

  it("uses the siblings of a subcategory", () => {
    const rows = buildIconPreviewRows({
      ...base,
      editedId: "iphone-cases",
      parentId: "cases",
    });
    expect(rows.map((r) => r.id)).toEqual(["iphone-cases"]);
  });
});

describe("iconPreviewTiles (TASK-1956)", () => {
  it("pairs the edited row with the next sibling, else the previous one", () => {
    const rows = buildIconPreviewRows({
      items: TREE,
      editedId: "audio",
      parentId: "",
      name: "Аудіо",
      icon: "headphones",
      fallbackName: "",
    });
    expect(iconPreviewTiles(rows).map((r) => r.id)).toEqual([
      "memory",
      "audio",
    ]);
  });
});
