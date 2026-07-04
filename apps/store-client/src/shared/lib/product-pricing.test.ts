import { getCardPricing } from "./product-pricing";

function summary(priceFrom: string, variantCount: number) {
  return { priceFrom, variantCount };
}

describe("getCardPricing (TASK-199 — card advertises its OWN position price)", () => {
  it("advertises the position's own price even when a sibling is cheaper (Double Pack bug)", () => {
    const pricing = getCardPricing({
      price: "299.00",
      variantSummary: summary("199.00", 2),
    });

    expect(pricing.advertisedPrice).toBe("299.00");
    expect(pricing.showFrom).toBe(false);
  });

  it("keeps the «від» prefix on the group's cheapest position", () => {
    const pricing = getCardPricing({
      price: "199.00",
      variantSummary: summary("199.00", 2),
    });

    expect(pricing.advertisedPrice).toBe("199.00");
    expect(pricing.showFrom).toBe(true);
  });

  it("shows «від» when a stale summary reports a minimum above the own price", () => {
    const pricing = getCardPricing({
      price: "149.00",
      variantSummary: summary("199.00", 3),
    });

    expect(pricing.advertisedPrice).toBe("149.00");
    expect(pricing.showFrom).toBe(true);
  });

  it("compares priceFrom numerically, not as a string", () => {
    const pricing = getCardPricing({
      price: "199.00",
      variantSummary: summary("199.0", 2),
    });

    expect(pricing.showFrom).toBe(true);
  });

  it("never shows «від» for a standalone product (variantCount 1)", () => {
    const pricing = getCardPricing({
      price: "99.00",
      variantSummary: summary("99.00", 1),
    });

    expect(pricing.advertisedPrice).toBe("99.00");
    expect(pricing.showFrom).toBe(false);
  });

  it("handles a missing variant summary (legacy payload)", () => {
    const pricing = getCardPricing({ price: "49.00" });

    expect(pricing.advertisedPrice).toBe("49.00");
    expect(pricing.showFrom).toBe(false);
  });

  describe("sale state — own compareAtPrice vs own price", () => {
    it("marks on sale with the discount computed from the OWN price", () => {
      // Group minimum 199 must NOT inflate the discount: 299 → 399 is −25%,
      // not 199 → 399 (−50%).
      const pricing = getCardPricing({
        price: "299.00",
        compareAtPrice: "399.00",
        variantSummary: summary("199.00", 2),
      });

      expect(pricing.onSale).toBe(true);
      expect(pricing.discountPercent).toBe(25);
    });

    it("is not on sale when compareAtPrice equals the price", () => {
      const pricing = getCardPricing({
        price: "100.00",
        compareAtPrice: "100.00",
      });

      expect(pricing.onSale).toBe(false);
      expect(pricing.discountPercent).toBe(0);
    });

    it("is not on sale when compareAtPrice is absent", () => {
      const pricing = getCardPricing({ price: "100.00", compareAtPrice: null });

      expect(pricing.onSale).toBe(false);
      expect(pricing.discountPercent).toBe(0);
    });
  });
});
