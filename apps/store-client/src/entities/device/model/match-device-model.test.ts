import {
  damerauLevenshtein,
  detectDeviceModelInQuery,
  matchDeviceModels,
  normalizeModelQuery,
  tokenizeModelText,
} from "./match-device-model";

// The seeded catalogue (apps/store-api/prisma/seed/data/devices.data.ts).
const MODELS = [
  ...[
    "iPhone 16 Pro Max",
    "iPhone 16 Pro",
    "iPhone 16 Plus",
    "iPhone 16",
    "iPhone 15 Pro Max",
    "iPhone 15 Pro",
    "iPhone 15 Plus",
    "iPhone 15",
    "iPhone 14 Pro Max",
    "iPhone 14 Pro",
    "iPhone 14 Plus",
    "iPhone 14",
    "iPhone 13 Pro Max",
    "iPhone 13 Pro",
    "iPhone 13",
    "iPhone 13 mini",
    "iPhone 12",
    'iPad Pro 13" (M4)',
    'iPad Air 11" (M2)',
    "iPad 10th gen",
    "Apple Watch Series 10 46mm",
    "Apple Watch Ultra 2 49mm",
  ].map((name) => ({ name, brandName: "Apple" })),
  ...[
    "Galaxy S24 Ultra",
    "Galaxy S24+",
    "Galaxy S24",
    "Galaxy S23 Ultra",
    "Galaxy A55",
  ].map((name) => ({ name, brandName: "Samsung" })),
  ...["Xiaomi 14 Ultra", "Xiaomi 14", "Redmi Note 13 Pro", "Redmi Note 13"].map(
    (name) => ({ name, brandName: "Xiaomi" }),
  ),
];

const names = (query: string, limit = 4) =>
  matchDeviceModels(query, MODELS, { limit }).map((m) => m.model.name);

describe("tokenizeModelText / normalizeModelQuery", () => {
  it("splits letter/digit boundaries and expands +", () => {
    expect(tokenizeModelText("Galaxy S24+")).toEqual([
      "galaxy",
      "s",
      "24",
      "plus",
    ]);
    expect(tokenizeModelText("iPhone15Pro")).toEqual(["iphone", "15", "pro"]);
  });

  it("maps Cyrillic words to Latin model words", () => {
    expect(normalizeModelQuery("Айфон 15 Про Макс")).toEqual([
      "iphone",
      "15",
      "pro",
      "max",
    ]);
    expect(normalizeModelQuery("галаксі s24 ультра")).toEqual([
      "galaxy",
      "s",
      "24",
      "ultra",
    ]);
    expect(normalizeModelQuery("айфон 15 плюс")).toEqual([
      "iphone",
      "15",
      "plus",
    ]);
  });

  it("drops brand noise and transliterates unknown Cyrillic letter by letter", () => {
    expect(normalizeModelQuery("apple ватч")).toEqual(["watch"]);
    expect(normalizeModelQuery("редмі нот 13")).toEqual([
      "redmi",
      "note",
      "13",
    ]);
    expect(normalizeModelQuery("ультру")).toEqual(["ultru"]);
  });
});

describe("damerauLevenshtein", () => {
  it("counts an adjacent transposition as one edit", () => {
    expect(damerauLevenshtein("iphnoe", "iphone")).toBe(1);
    expect(damerauLevenshtein("galxy", "galaxy")).toBe(1);
    expect(damerauLevenshtein("ultra", "ultra")).toBe(0);
    expect(damerauLevenshtein("", "abc")).toBe(3);
    expect(damerauLevenshtein("kitten", "sitting")).toBe(3);
  });
});

describe("matchDeviceModels", () => {
  it("«iphone 15 про» → iPhone 15 Pro first, then Pro Max", () => {
    expect(names("iphone 15 про", 2)).toEqual([
      "iPhone 15 Pro",
      "iPhone 15 Pro Max",
    ]);
  });

  it("«galaxy s24 ультра» → Galaxy S24 Ultra first", () => {
    const [first] = matchDeviceModels("galaxy s24 ультра", MODELS);
    expect(first.model.name).toBe("Galaxy S24 Ultra");
    expect(first.corrected).toBe(false);
  });

  it("«айфон 13» → the plain model first, then its variants", () => {
    expect(names("айфон 13")).toEqual([
      "iPhone 13",
      "iPhone 13 Pro",
      "iPhone 13 mini",
      "iPhone 13 Pro Max",
    ]);
  });

  it("tolerates typos and marks the result as corrected", () => {
    const [first] = matchDeviceModels("iphnoe 15", MODELS);
    expect(first.model.name).toBe("iPhone 15");
    expect(first.corrected).toBe(true);
    expect(names("galxy a55", 1)).toEqual(["Galaxy A55"]);
  });

  it("marks a letter-by-letter transliteration as corrected", () => {
    const [first] = matchDeviceModels("galaxy s23 ультру", MODELS);
    expect(first.model.name).toBe("Galaxy S23 Ultra");
    expect(first.corrected).toBe(true);
  });

  it("matches prefixes while the user is typing", () => {
    expect([...names("galaxy s2", 10)].sort()).toEqual([
      "Galaxy S23 Ultra",
      "Galaxy S24",
      "Galaxy S24 Ultra",
      "Galaxy S24+",
    ]);
    expect(names("redmi no", 1)).toEqual(["Redmi Note 13"]);
  });

  it("matches the brand name as a model word", () => {
    expect(names("xiaomi redmi note 13 pro", 1)).toEqual(["Redmi Note 13 Pro"]);
    expect(names("samsung s24+", 1)).toEqual(["Galaxy S24+"]);
  });

  it("finds Watch and iPad by Ukrainian words", () => {
    expect(names("ватч ультра", 1)).toEqual(["Apple Watch Ultra 2 49mm"]);
    expect(names("айпад 10-го покоління", 1)).toEqual(["iPad 10th gen"]);
    expect(names("ватч 46мм", 1)).toEqual(["Apple Watch Series 10 46mm"]);
  });

  it("does not fuzz numbers: iPhone 14 never matches «iphone 15»", () => {
    expect(names("iphone 15", 10)).not.toContain("iPhone 14");
    expect(names("iphone 15", 10)).not.toContain("iPhone 16");
  });

  it("returns nothing for an empty or unmatched query and respects the limit", () => {
    expect(matchDeviceModels("", MODELS)).toEqual([]);
    expect(matchDeviceModels("   apple ", MODELS)).toEqual([]);
    expect(matchDeviceModels("nokia 3310", MODELS)).toEqual([]);
    expect(matchDeviceModels("iphone", MODELS, { limit: 6 })).toHaveLength(6);
  });

  it("returns scores in descending order", () => {
    const scores = matchDeviceModels("iphone pro", MODELS).map((m) => m.score);
    expect(scores).toEqual([...scores].sort((a, b) => b - a));
  });
});

describe("detectDeviceModelInQuery", () => {
  it("splits the model off a free-text query and drops the linking word", () => {
    const found = detectDeviceModelInQuery("чохол для айфон 15 про", MODELS);
    expect(found?.match.model.name).toBe("iPhone 15 Pro");
    expect(found?.modelText).toBe("айфон 15 про");
    expect(found?.rest).toBe("чохол");
  });

  it("keeps words on both sides of the model", () => {
    const found = detectDeviceModelInQuery(
      "скло galaxy s24 ultra матове",
      MODELS,
    );
    expect(found?.match.model.name).toBe("Galaxy S24 Ultra");
    expect(found?.rest).toBe("скло матове");
  });

  it("prefers the longest run of words (Pro Max over Pro)", () => {
    const found = detectDeviceModelInQuery(
      "чохол iphone 15 pro max magsafe",
      MODELS,
    );
    expect(found?.match.model.name).toBe("iPhone 15 Pro Max");
    expect(found?.rest).toBe("чохол magsafe");
  });

  it("accepts a model code like «s24» without the line name", () => {
    expect(
      detectDeviceModelInQuery("чохол s24", MODELS)?.match.model.name,
    ).toBe("Galaxy S24");
  });

  it("returns the whole query as the model when nothing else is typed", () => {
    const found = detectDeviceModelInQuery("iphnoe 13", MODELS);
    expect(found?.match.model.name).toBe("iPhone 13");
    expect(found?.match.corrected).toBe(true);
    expect(found?.rest).toBe("");
  });

  it("does not read a bare variant word or number as a device", () => {
    expect(detectDeviceModelInQuery("чохол pro", MODELS)).toBeNull();
    expect(detectDeviceModelInQuery("зарядка 15 вт", MODELS)).toBeNull();
    expect(detectDeviceModelInQuery("навушники", MODELS)).toBeNull();
    expect(detectDeviceModelInQuery("", MODELS)).toBeNull();
    expect(detectDeviceModelInQuery("iphone 15", [])).toBeNull();
  });
});
