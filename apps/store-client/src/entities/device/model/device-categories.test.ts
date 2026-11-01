import {
  deviceCategoryHref,
  deviceHubHref,
  selectDeviceCategories,
  totalProductCount,
  type CompatPageLike,
} from "./device-categories";

function page(
  categoryId: string,
  deviceSlug: string,
  productCount: number,
): CompatPageLike {
  return {
    categoryId,
    categorySlug: categoryId,
    categoryName: categoryId.toUpperCase(),
    deviceSlug,
    productCount,
  };
}

// Owner's root order: cases, glass, chargers, cables.
const ROOTS = [
  { id: "cases", icon: "cases" },
  { id: "glass", icon: null },
  { id: "chargers" },
  { id: "cables", icon: "cables" },
];

describe("selectDeviceCategories", () => {
  it("keeps only the device's root categories, most products first", () => {
    const pages = [
      page("cases", "iphone-15-pro", 40),
      // A subcategory row (compat-pages rolls counts up the tree) — not a root.
      page("iphone-cases", "iphone-15-pro", 40),
      page("chargers", "iphone-15-pro", 12),
      page("glass", "iphone-15-pro", 18),
      // Another device.
      page("cables", "galaxy-s24", 9),
    ];

    expect(
      selectDeviceCategories(pages, "iphone-15-pro", ROOTS).map((c) => c.id),
    ).toEqual(["cases", "glass", "chargers"]);
  });

  it("breaks count ties in the owner's root order", () => {
    const pages = [
      page("cables", "iphone-15", 5),
      page("glass", "iphone-15", 5),
      page("cases", "iphone-15", 5),
    ];

    expect(
      selectDeviceCategories(pages, "iphone-15", ROOTS).map((c) => c.id),
    ).toEqual(["cases", "glass", "cables"]);
  });

  it("drops empty rows and returns [] for an unknown device", () => {
    const pages = [page("cases", "iphone-15", 0)];
    expect(selectDeviceCategories(pages, "iphone-15", ROOTS)).toEqual([]);
    expect(selectDeviceCategories(pages, "pixel-9", ROOTS)).toEqual([]);
  });

  it("maps a page to the bar's category shape", () => {
    expect(
      selectDeviceCategories(
        [page("cases", "iphone-15", 3)],
        "iphone-15",
        ROOTS,
      ),
    ).toEqual([
      {
        id: "cases",
        slug: "cases",
        name: "CASES",
        icon: "cases",
        productCount: 3,
      },
    ]);
  });

  // TASK-1956: compat-pages rows carry no icon — the matching root does.
  it("takes the icon from the matching root, null when it has none", () => {
    const icons = selectDeviceCategories(
      [page("cases", "x", 3), page("glass", "x", 2), page("chargers", "x", 1)],
      "x",
      ROOTS,
    ).map((c) => c.icon);
    expect(icons).toEqual(["cases", null, null]);
  });
});

describe("totalProductCount", () => {
  it("sums the root counts", () => {
    const categories = selectDeviceCategories(
      [page("cases", "x", 40), page("glass", "x", 18)],
      "x",
      ROOTS,
    );
    expect(totalProductCount(categories)).toBe(58);
    expect(totalProductCount([])).toBe(0);
  });
});

describe("hrefs", () => {
  it("links the compat listing and the device hub", () => {
    expect(deviceCategoryHref("cases", "iphone-15-pro")).toBe(
      "/catalog/cases/iphone-15-pro",
    );
    expect(deviceHubHref("iphone-15-pro")).toBe("/devices/iphone-15-pro");
  });
});
