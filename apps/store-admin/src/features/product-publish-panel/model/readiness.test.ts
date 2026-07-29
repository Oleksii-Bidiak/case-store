import {
  buildReadinessChecks,
  canPublish,
  type ReadinessInput,
} from "./readiness";

/** A product that satisfies every check — each test spoils exactly one thing. */
const READY: ReadinessInput = {
  name: "Чохол Armor Magnetic",
  categoryId: "9f6f0b1e-0000-4000-8000-000000000001",
  price: "299.00",
  stock: 12,
  description: "<p>Протиударний чохол</p>",
  imageCount: 3,
  specCount: 4,
  compatCount: 2,
};

const check = (input: ReadinessInput, key: string) =>
  buildReadinessChecks(input).find((c) => c.key === key)!;

describe("buildReadinessChecks (TASK-361)", () => {
  it("passes every check for a fully filled product", () => {
    expect(buildReadinessChecks(READY).every((c) => c.done)).toBe(true);
    expect(canPublish(buildReadinessChecks(READY))).toBe(true);
  });

  describe("blocking checks keep the product unpublishable", () => {
    it.each([
      ["name", { name: "   " }],
      ["category", { categoryId: "" }],
      ["price", { price: "0" }],
      ["photo", { imageCount: 0 }],
    ] as const)("%s", (key, overrides) => {
      const input = { ...READY, ...overrides };
      expect(check(input, key).done).toBe(false);
      expect(check(input, key).blocking).toBe(true);
      expect(canPublish(buildReadinessChecks(input))).toBe(false);
    });
  });

  describe("advisory checks warn but never block", () => {
    it.each([
      ["description", { description: null }],
      ["stock", { stock: 0 }],
      ["specs", { specCount: 0 }],
      ["compat", { compatCount: 0 }],
    ] as const)("%s", (key, overrides) => {
      const input = { ...READY, ...overrides };
      expect(check(input, key).done).toBe(false);
      expect(check(input, key).blocking).toBe(false);
      expect(canPublish(buildReadinessChecks(input))).toBe(true);
    });
  });

  // Tiptap serializes a cleared editor as "<p></p>", which is 7 characters of
  // nothing. A length check would call that a written description.
  it("does not count an empty rich-text document as a description", () => {
    expect(
      check({ ...READY, description: "<p></p>" }, "description").done,
    ).toBe(false);
    expect(
      check({ ...READY, description: "<p><br></p>" }, "description").done,
    ).toBe(false);
  });

  it("rejects a price that is not a positive number", () => {
    expect(check({ ...READY, price: "" }, "price").done).toBe(false);
    expect(check({ ...READY, price: "-1" }, "price").done).toBe(false);
    expect(check({ ...READY, price: "0.01" }, "price").done).toBe(true);
  });
});
