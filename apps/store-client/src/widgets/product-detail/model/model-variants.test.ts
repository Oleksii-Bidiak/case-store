import type { ProductGroupEntity } from "@/entities/product";

import {
  currentModelValue,
  deviceForModelValue,
  findModelAxis,
  findVariantFor,
  isModelAxis,
  modelChipLabel,
  normalizeModelName,
  otherModelVariants,
} from "./model-variants";

function position(
  slug: string,
  attributes: Record<string, string>,
  positionOrder: number,
  extra: Partial<{ isActive: boolean; price: string }> = {},
) {
  return {
    id: slug,
    slug,
    name: slug,
    price: extra.price ?? "999",
    attributes,
    stock: 1,
    isActive: extra.isActive ?? true,
    positionOrder,
  };
}

const group: ProductGroupEntity = {
  id: "g-1",
  name: "Clear Case",
  axes: [
    { name: "Модель", sortOrder: 0 },
    { name: "Колір", sortOrder: 1 },
  ] as ProductGroupEntity["axes"],
  positions: [
    position(
      "case-15pro-black",
      { Модель: "iPhone 15 Pro", Колір: "Чорний" },
      0,
    ),
    position("case-15pro-blue", { Модель: "iPhone 15 Pro", Колір: "Синій" }, 1),
    position("case-13-blue", { Модель: "iPhone 13", Колір: "Синій" }, 2),
    position("case-13-black", { Модель: "iPhone 13", Колір: "Чорний" }, 3),
    position("case-14-black", { Модель: "iPhone 14", Колір: "Чорний" }, 4, {
      isActive: false,
    }),
  ],
};

describe("model variants", () => {
  it("recognises the model axis by name", () => {
    expect(isModelAxis("Модель")).toBe(true);
    expect(isModelAxis("модель пристрою")).toBe(true);
    expect(isModelAxis("Model")).toBe(true);
    expect(isModelAxis("Колір")).toBe(false);
    expect(findModelAxis(group)).toBe("Модель");
    expect(findModelAxis({ ...group, axes: [group.axes[1]] })).toBeNull();
    expect(findModelAxis(null)).toBeNull();
  });

  it("normalises names so a slug and a display name compare equal", () => {
    expect(normalizeModelName("iPhone 15 Pro")).toBe(
      normalizeModelName("iphone-15-pro"),
    );
    expect(normalizeModelName("Galaxy S24+")).toBe("galaxys24plus");
  });

  it("strips the «iPhone » prefix from a chip label only", () => {
    expect(modelChipLabel("iPhone 15 Pro Max")).toBe("15 Pro Max");
    expect(modelChipLabel("Galaxy S24")).toBe("Galaxy S24");
  });

  it("ties a model value to the saved device it names", () => {
    const devices = [{ name: "Galaxy S24" }, { name: "iPhone 13" }];
    expect(deviceForModelValue("iPhone 13", devices)).toBe(devices[1]);
    expect(deviceForModelValue("iPhone 15", devices)).toBeNull();
  });

  it("reads the current position's model", () => {
    expect(currentModelValue(group, { Модель: "iPhone 15 Pro" })).toBe(
      "iPhone 15 Pro",
    );
    expect(currentModelValue(null, { Модель: "iPhone 15 Pro" })).toBeNull();
  });

  it("finds the device's variant in the same colour", () => {
    const current = { Модель: "iPhone 15 Pro", Колір: "Чорний" };
    expect(findVariantFor(group, current, { name: "iPhone 13" })?.slug).toBe(
      "case-13-black",
    );
  });

  it("falls back to the first variant when the colour has no match", () => {
    const current = { Модель: "iPhone 15 Pro", Колір: "Зелений" };
    expect(findVariantFor(group, current, { name: "iPhone 13" })?.slug).toBe(
      "case-13-blue",
    );
  });

  it("offers no variant for a model the group lacks or has only inactive", () => {
    const current = { Модель: "iPhone 15 Pro", Колір: "Чорний" };
    expect(findVariantFor(group, current, { name: "Galaxy S24" })).toBeNull();
    expect(findVariantFor(group, current, { name: "iPhone 14" })).toBeNull();
    expect(
      findVariantFor({ ...group, axes: [group.axes[1]] }, current, {
        name: "iPhone 13",
      }),
    ).toBeNull();
  });

  it("lists every other model once, in sort order, with a sibling to open", () => {
    const current = { Модель: "iPhone 15 Pro", Колір: "Чорний" };
    expect(otherModelVariants(group, current)).toEqual([
      { model: "iPhone 13", slug: "case-13-black" },
    ]);
  });
});
