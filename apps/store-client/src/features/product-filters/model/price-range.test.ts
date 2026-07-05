import {
  PRICE_DOMAIN_MAX,
  clampPrice,
  normalizePriceRange,
  parsePriceInput,
  priceRangeToUrlUpdates,
  priceToInputText,
  rangeKey,
} from "./price-range";

describe("clampPrice", () => {
  it("keeps in-domain values untouched (decimals included)", () => {
    expect(clampPrice(500)).toBe(500);
    expect(clampPrice(49.99)).toBe(49.99);
  });

  it("clamps below-zero values to 0", () => {
    expect(clampPrice(-5)).toBe(0);
  });

  it("clamps values above the domain max", () => {
    expect(clampPrice(PRICE_DOMAIN_MAX + 1)).toBe(PRICE_DOMAIN_MAX);
  });
});

describe("parsePriceInput", () => {
  it("parses plain and decimal numbers", () => {
    expect(parsePriceInput("150")).toBe(150);
    expect(parsePriceInput("49.99")).toBe(49.99);
  });

  it("returns undefined for empty or whitespace-only input", () => {
    expect(parsePriceInput("")).toBeUndefined();
    expect(parsePriceInput("   ")).toBeUndefined();
  });

  it("returns undefined for non-numeric or non-finite input", () => {
    expect(parsePriceInput("abc")).toBeUndefined();
    expect(parsePriceInput("Infinity")).toBeUndefined();
  });

  it("keeps negative numbers (clamping happens on normalize)", () => {
    expect(parsePriceInput("-5")).toBe(-5);
  });
});

describe("normalizePriceRange", () => {
  it("maps unset bounds to the full domain", () => {
    expect(normalizePriceRange(undefined, undefined, "min")).toEqual([
      0,
      PRICE_DOMAIN_MAX,
    ]);
  });

  it("clamps out-of-domain bounds", () => {
    expect(normalizePriceRange(-100, PRICE_DOMAIN_MAX * 2, "min")).toEqual([
      0,
      PRICE_DOMAIN_MAX,
    ]);
  });

  it("keeps a valid ordered range untouched", () => {
    expect(normalizePriceRange(100, 5000, "max")).toEqual([100, 5000]);
  });

  it("clamps an inverted min down to max when min was edited", () => {
    expect(normalizePriceRange(8000, 2000, "min")).toEqual([2000, 2000]);
  });

  it("clamps an inverted max up to min when max was edited", () => {
    expect(normalizePriceRange(8000, 2000, "max")).toEqual([8000, 8000]);
  });
});

describe("priceRangeToUrlUpdates", () => {
  it("omits both params at the domain edges (no active filter)", () => {
    expect(priceRangeToUrlUpdates([0, PRICE_DOMAIN_MAX])).toEqual({
      minPrice: undefined,
      maxPrice: undefined,
    });
  });

  it("serialises interior bounds", () => {
    expect(priceRangeToUrlUpdates([100, 5000])).toEqual({
      minPrice: "100",
      maxPrice: "5000",
    });
  });
});

describe("priceToInputText", () => {
  it("renders the domain edge as an empty field (filter unset)", () => {
    expect(priceToInputText(0, 0)).toBe("");
    expect(priceToInputText(PRICE_DOMAIN_MAX, PRICE_DOMAIN_MAX)).toBe("");
  });

  it("renders interior values as plain numbers", () => {
    expect(priceToInputText(2500, 0)).toBe("2500");
    expect(priceToInputText(49.99, PRICE_DOMAIN_MAX)).toBe("49.99");
  });
});

describe("rangeKey", () => {
  it("produces a stable identity for a range", () => {
    expect(rangeKey([100, 5000])).toBe(rangeKey([100, 5000]));
    expect(rangeKey([100, 5000])).not.toBe(rangeKey([100, 5001]));
  });
});
