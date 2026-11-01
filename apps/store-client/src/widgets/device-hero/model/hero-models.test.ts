import type {
  DeviceHubGroupEntity,
  PublicProductEntity,
} from "@/shared/api/generated/models";

import {
  deviceCategoryHref,
  deviceHubHref,
  hasHub,
  pickHeroProducts,
  quickCategories,
} from "./hero-models";

const product = (id: string) => ({ id }) as PublicProductEntity;

function group(
  slug: string,
  productCount: number,
  productIds: string[],
): DeviceHubGroupEntity {
  return {
    category: { id: slug, name: slug, slug },
    productCount,
    products: productIds.map(product),
  };
}

describe("device hero links (TASK-1952)", () => {
  it("builds the hub and the compat landing URLs", () => {
    expect(deviceHubHref("iphone-15-pro")).toBe("/devices/iphone-15-pro");
    expect(deviceCategoryHref("cases", "iphone-15-pro")).toBe(
      "/catalog/cases/iphone-15-pro",
    );
    expect(deviceHubHref("a b")).toBe("/devices/a%20b");
  });

  it("links the hub only for a model with products", () => {
    expect(hasHub(3)).toBe(true);
    expect(hasHub(0)).toBe(false);
    expect(hasHub(null)).toBe(false);
    expect(hasHub(undefined)).toBe(false);
  });
});

describe("quickCategories", () => {
  it("returns the biggest categories first, at most four, stable on ties", () => {
    const groups = [
      group("cables", 10, []),
      group("cases", 44, []),
      group("glass", 15, []),
      group("chargers", 15, []),
      group("holders", 3, []),
    ];
    expect(quickCategories(groups).map((g) => g.category.slug)).toEqual([
      "cases",
      "glass",
      "chargers",
      "cables",
    ]);
    // The input is not reordered.
    expect(groups[0]?.category.slug).toBe("cables");
  });
});

describe("pickHeroProducts", () => {
  it("takes one product per category before a second from any", () => {
    const picks = pickHeroProducts([
      group("glass", 15, ["g1", "g2"]),
      group("cases", 44, ["c1", "c2", "c3"]),
    ]);
    expect(picks.map((p) => p.id)).toEqual(["c1", "g1", "c2"]);
  });

  it("skips a product listed in two groups and copes with thin hubs", () => {
    expect(
      pickHeroProducts([
        group("cases", 5, ["p1"]),
        group("glass", 4, ["p1", "p2"]),
      ]).map((p) => p.id),
    ).toEqual(["p1", "p2"]);
    expect(pickHeroProducts([])).toEqual([]);
  });
});
