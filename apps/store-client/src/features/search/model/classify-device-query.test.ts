import {
  classifyDeviceQuery,
  deviceBlockPlacement,
  parseDeviceQuery,
  showNotSoldLine,
} from "./classify-device-query";

// A slice of the seeded catalogue (apps/store-api/prisma/seed/data/devices.data.ts).
const MODELS = [
  ...[
    "iPhone 16 Pro",
    "iPhone 15 Pro Max",
    "iPhone 15 Pro",
    "iPhone 15 Plus",
    "iPhone 15",
    "iPhone 13 mini",
    "iPhone 12",
    "Apple Watch Series 10 46mm",
  ].map((name) => ({ name, brandName: "Apple" })),
  ...["Galaxy S24 Ultra", "Galaxy S24+", "Galaxy S24", "Galaxy A55"].map(
    (name) => ({ name, brandName: "Samsung" }),
  ),
  ...["Redmi Note 13 Pro", "Redmi Note 13"].map((name) => ({
    name,
    brandName: "Xiaomi",
  })),
];

const classify = (query: string) => classifyDeviceQuery(query, MODELS);

describe("parseDeviceQuery — the Д3-2 query rules", () => {
  it("leaves a bare model as it is", () => {
    expect(parseDeviceQuery("iPhone 15 Pro")).toEqual({
      modelText: "iphone 15 pro",
      productWord: null,
      deviceIntent: false,
    });
  });

  it.each([
    ["смартфон iphone 15 pro 256 гб"],
    ["iphone 12 mini купити"],
    ["Телефон Galaxy S24"],
    ["iphone 15 pro 256"],
    ["iphone 15 pro 256гб"],
    ["galaxy s24 8/256"],
    ["iphone 16 pro 1тб"],
    ["новий iphone 16 pro"],
  ])("«%s» → device intent, words stripped", (query) => {
    const parsed = parseDeviceQuery(query);
    expect(parsed.deviceIntent).toBe(true);
    expect(parsed.productWord).toBeNull();
    expect(parsed.modelText).not.toMatch(/смартфон|купити|гб|256|телефон/);
  });

  it("does not read a bare model number as a storage size", () => {
    expect(parseDeviceQuery("watch se 2").deviceIntent).toBe(false);
    expect(parseDeviceQuery("iphone 16").modelText).toBe("iphone 16");
  });

  it.each([
    ["чохол iphone 15 pro", "cases"],
    ["Чохли для айфон 15", "cases"],
    ["бампер galaxy s24", "cases"],
    ["скло iphone 15", "screen-protectors"],
    ["плівка redmi note 13", "screen-protectors"],
    ["зарядка iphone 15", "chargers"],
    ["кабель для iphone 15", "cables"],
    ["ремінець watch 46", "watch-bands"],
    ["павербанк iphone", "power-banks"],
  ] as const)("«%s» → product word %s", (query, key) => {
    expect(parseDeviceQuery(query).productWord).toBe(key);
  });

  it("drops linking words and keeps the first product word", () => {
    expect(parseDeviceQuery("чохол і скло для iphone 15")).toEqual({
      modelText: "і iphone 15",
      productWord: "cases",
      deviceIntent: false,
    });
  });

  it("lets the accessory word cancel the device intent", () => {
    const parsed = parseDeviceQuery("купити чохол iphone 15 pro");
    expect(parsed.productWord).toBe("cases");
    expect(parsed.deviceIntent).toBe(false);
  });
});

describe("classifyDeviceQuery", () => {
  it("recognises a Cyrillic query and flags it as corrected", () => {
    const match = classify("айфон 15 про");
    expect(match?.model.name).toBe("iPhone 15 Pro");
    expect(match?.corrected).toBe(true);
    expect(match?.alternatives.map((m) => m.name)).toEqual([
      "iPhone 15 Pro Max",
    ]);
  });

  it("recognises a mixed query with a typo («iphone 15 про»)", () => {
    expect(classify("iphone 15 про")?.model.name).toBe("iPhone 15 Pro");
    expect(classify("iphnoe 15 pro")?.corrected).toBe(true);
  });

  it("does not flag an exact Latin query as corrected", () => {
    const match = classify("galaxy s24");
    expect(match?.model.name).toBe("Galaxy S24");
    expect(match?.corrected).toBe(false);
    expect(match?.alternatives.map((m) => m.name)).toEqual(
      expect.arrayContaining(["Galaxy S24 Ultra", "Galaxy S24+"]),
    );
  });

  it("offers up to three alternatives for a family query («iphone 15»)", () => {
    const match = classify("iphone 15");
    expect(match?.model.name).toBe("iPhone 15");
    // Shorter names first — the matcher's tie-break.
    expect(match?.alternatives.map((m) => m.name)).toEqual([
      "iPhone 15 Pro",
      "iPhone 15 Plus",
      "iPhone 15 Pro Max",
    ]);
  });

  it("finds the model behind a device word and a storage size", () => {
    const match = classify("смартфон iphone 15 pro 256 гб");
    expect(match?.model.name).toBe("iPhone 15 Pro");
    expect(match?.deviceIntent).toBe(true);
    expect(match?.productWord).toBeNull();
  });

  it("finds the model behind an accessory word", () => {
    const match = classify("чохол для iphone 15 pro");
    expect(match?.model.name).toBe("iPhone 15 Pro");
    expect(match?.productWord).toBe("cases");
  });

  it("recognises a watch model by its short name («ремінець watch 46»)", () => {
    const match = classify("ремінець apple watch series 10");
    expect(match?.model.name).toBe("Apple Watch Series 10 46mm");
    expect(match?.productWord).toBe("watch-bands");
  });

  it.each([["чохол"], ["magsafe"], ["зарядка для тостера"], ["pro"], [""]])(
    "«%s» → no model",
    (query) => {
      expect(classify(query)).toBeNull();
    },
  );

  it("returns null without a model list (still loading)", () => {
    expect(classifyDeviceQuery("iphone 15", [])).toBeNull();
  });
});

describe("deviceBlockPlacement / showNotSoldLine — the truth table", () => {
  const bare = { productWord: null, deviceIntent: false };
  const intent = { productWord: null, deviceIntent: true };
  const accessory = { productWord: "cases" as const, deviceIntent: false };

  it("bare model, sold → block under the model row, no line", () => {
    expect(deviceBlockPlacement(bare, true)).toBe("after");
    expect(showNotSoldLine(bare, true)).toBe(false);
  });

  it("device word / storage, sold → block first", () => {
    expect(deviceBlockPlacement(intent, true)).toBe("before");
    expect(showNotSoldLine(intent, true)).toBe(false);
  });

  it("device word, not sold → no block, the not-sold line", () => {
    expect(deviceBlockPlacement(intent, false)).toBe("hidden");
    expect(showNotSoldLine(intent, false)).toBe(true);
  });

  it("bare model, not sold → neither block nor line", () => {
    expect(deviceBlockPlacement(bare, false)).toBe("hidden");
    expect(showNotSoldLine(bare, false)).toBe(false);
  });

  it("accessory word → no block whether sold or not", () => {
    expect(deviceBlockPlacement(accessory, true)).toBe("hidden");
    expect(deviceBlockPlacement(accessory, false)).toBe("hidden");
    expect(showNotSoldLine(accessory, false)).toBe(false);
  });

  it("while the device lookup runs → nothing yet", () => {
    expect(deviceBlockPlacement(intent, undefined)).toBe("hidden");
    expect(showNotSoldLine(intent, undefined)).toBe(false);
  });
});
