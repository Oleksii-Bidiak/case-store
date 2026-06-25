import type { ProductVariantEntity } from "@/entities/product";
import { pickCheapestActiveVariantId } from "./pick-default-variant";

const variant = (
  over: Partial<ProductVariantEntity> & { id: string },
): ProductVariantEntity => ({
  name: over.id,
  price: "10.00",
  stock: 5,
  isActive: true,
  ...over,
});

describe("pickCheapestActiveVariantId", () => {
  it("returns null when there are no variants", () => {
    expect(pickCheapestActiveVariantId([])).toBeNull();
  });

  it("returns null when no variant is active", () => {
    expect(
      pickCheapestActiveVariantId([
        variant({ id: "a", isActive: false, price: "5.00" }),
      ]),
    ).toBeNull();
  });

  it("picks the active variant with the lowest price, not the alphabetically first", () => {
    // 'aaa' is alphabetically first but pricier; 'zzz' is the cheapest.
    const id = pickCheapestActiveVariantId([
      variant({ id: "aaa", name: "aaa", price: "29.99" }),
      variant({ id: "zzz", name: "zzz", price: "12.99" }),
    ]);

    expect(id).toBe("zzz");
  });

  it("ignores inactive variants even when they are cheaper", () => {
    const id = pickCheapestActiveVariantId([
      variant({ id: "cheap-inactive", price: "1.00", isActive: false }),
      variant({ id: "active", price: "9.99", isActive: true }),
    ]);

    expect(id).toBe("active");
  });

  it("compares numerically, not lexicographically", () => {
    // "9.99" > "100.00" as strings, but 9.99 < 100.00 as numbers.
    const id = pickCheapestActiveVariantId([
      variant({ id: "hundred", price: "100.00" }),
      variant({ id: "nine", price: "9.99" }),
    ]);

    expect(id).toBe("nine");
  });

  it("returns one of the tied variants when prices are equal", () => {
    const id = pickCheapestActiveVariantId([
      variant({ id: "a", price: "10.00" }),
      variant({ id: "b", price: "10.00" }),
    ]);

    expect(["a", "b"]).toContain(id);
  });
});
