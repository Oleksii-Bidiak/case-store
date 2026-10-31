import { formatCount, minDevicePrice, pickSoldDevices } from "./sold-devices";

const MODELS = [
  "iPhone 15 Pro Max",
  "iPhone 15 Pro",
  "iPhone 15",
  "Apple Watch Series 10 46mm",
].map((name) => ({ name, brandName: "Apple" }));

const [PRO_MAX, PRO, PLAIN, WATCH] = MODELS;

const product = (name: string, price = "100", priceFrom?: string) => ({
  name,
  price,
  variantSummary: priceFrom ? { priceFrom } : undefined,
});

describe("pickSoldDevices — the device itself among the hits", () => {
  const hits = [
    product("Смартфон Apple iPhone 15 Pro"),
    product("Смартфон Apple iPhone 15"),
    product("Смартфон Apple iPhone 15 Pro Max"),
    product("Чохол Spigen для iPhone 15 Pro"),
    product("Захисне скло для iPhone 15 Pro"),
  ];

  it("keeps the products named exactly after the model", () => {
    expect(pickSoldDevices(hits, PRO, MODELS).map((p) => p.name)).toEqual([
      "Смартфон Apple iPhone 15 Pro",
    ]);
    expect(pickSoldDevices(hits, PLAIN, MODELS).map((p) => p.name)).toEqual([
      "Смартфон Apple iPhone 15",
    ]);
    expect(pickSoldDevices(hits, PRO_MAX, MODELS).map((p) => p.name)).toEqual([
      "Смартфон Apple iPhone 15 Pro Max",
    ]);
  });

  it("never counts an accessory for the model as the device", () => {
    const straps = [product("Ремінець Milanese для Apple Watch Series 10")];
    expect(pickSoldDevices(straps, WATCH, MODELS)).toEqual([]);
  });

  it("is empty when the store does not sell the model", () => {
    expect(
      pickSoldDevices([product("Смартфон Apple iPhone 15")], PRO, MODELS),
    ).toEqual([]);
  });
});

describe("minDevicePrice", () => {
  it("takes the cheapest «від» price, falling back to the own price", () => {
    expect(
      minDevicePrice([product("a", "52999", "45999"), product("b", "47999")]),
    ).toBe("45999");
  });

  it("is null for no products", () => {
    expect(minDevicePrice([])).toBeNull();
  });
});

describe("formatCount", () => {
  it("groups digits uk-UA style, no noun", () => {
    expect(formatCount(128)).toBe("128");
    expect(formatCount(1280).replace(/\s/g, " ")).toBe("1 280");
  });
});
