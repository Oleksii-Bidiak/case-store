import type { DeviceModelListItemEntity } from "@/entities/device";

import {
  familiesPresent,
  groupBySeries,
  popularModels,
  withFamily,
} from "./picker-models";

function model(
  id: string,
  name: string,
  over: Partial<DeviceModelListItemEntity> = {},
): DeviceModelListItemEntity {
  return {
    id,
    deviceBrandId: "b",
    name,
    slug: id,
    series: null,
    releaseYear: null,
    brandName: "Apple",
    brandSlug: "apple",
    productCount: 1,
    ...over,
  };
}

describe("picker model shaping (TASK-2070)", () => {
  it("resolves the family once per model", () => {
    const [iphone, galaxy, other] = withFamily([
      model("a", "iPhone 15"),
      model("b", "Galaxy S24", { brandName: "Samsung", brandSlug: "samsung" }),
      model("c", "Pixel 9", { brandName: "Google", brandSlug: "google" }),
    ]);
    expect(iphone.family).toBe("iphone");
    expect(galaxy.family).toBe("galaxy");
    expect(other.family).toBeNull();
  });

  it("takes the first popular models, sending the ones with no products last", () => {
    const list = withFamily([
      model("a", "iPhone 16", { productCount: 0 }),
      model("b", "iPhone 15", { productCount: 40 }),
      model("c", "iPhone 14", { productCount: 3 }),
    ]);
    expect(popularModels(list, 2).map((m) => m.id)).toEqual(["b", "c"]);
    expect(popularModels(list, 8).map((m) => m.id)).toEqual(["b", "c", "a"]);
  });

  it("lists only the families that have models, in tab order", () => {
    const list = withFamily([
      model("w", "Apple Watch Series 10 46 мм", { series: "Apple Watch" }),
      model("i", "iPhone 13"),
    ]);
    expect(familiesPresent(list)).toEqual(["iphone", "watch"]);
  });

  it("groups a family by series, newest first, «Pro Max · Pro · Plus · base» inside", () => {
    const list = withFamily([
      model("15", "iPhone 15", { series: "iPhone 15", releaseYear: 2023 }),
      model("16", "iPhone 16", { series: "iPhone 16", releaseYear: 2024 }),
      model("16pm", "iPhone 16 Pro Max", {
        series: "iPhone 16",
        releaseYear: 2024,
      }),
      model("16p", "iPhone 16 Pro", { series: "iPhone 16", releaseYear: 2024 }),
      model("16plus", "iPhone 16 Plus", {
        series: "iPhone 16",
        releaseYear: 2024,
      }),
      model("se", "iPhone SE"),
      model("w", "Apple Watch Ultra 2", { series: "Apple Watch" }),
    ]);
    const groups = groupBySeries(list, "iphone");
    expect(groups.map((g) => g.title)).toEqual([
      "iPhone 16",
      "iPhone 15",
      null,
    ]);
    expect(groups[0].models.map((m) => m.name)).toEqual([
      "iPhone 16 Pro Max",
      "iPhone 16 Pro",
      "iPhone 16 Plus",
      "iPhone 16",
    ]);
    expect(groups[2].models.map((m) => m.id)).toEqual(["se"]);
  });

  it("orders series by number, not by string (iPhone 9 after iPhone 12)", () => {
    const list = withFamily([
      model("9", "iPhone 9", { series: "iPhone 9" }),
      model("12", "iPhone 12", { series: "iPhone 12" }),
    ]);
    expect(groupBySeries(list, "iphone").map((g) => g.title)).toEqual([
      "iPhone 12",
      "iPhone 9",
    ]);
  });
});
