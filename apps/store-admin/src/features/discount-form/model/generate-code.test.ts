import { generateDiscountCode } from "./generate-code";

describe("generateDiscountCode", () => {
  it("makes eight characters a customer can type — no 0/O, 1/I/L", () => {
    for (let i = 0; i < 50; i += 1) {
      const code = generateDiscountCode();
      expect(code).toMatch(/^[A-Z2-9]{8}$/);
      expect(code).not.toMatch(/[01OIL]/);
    }
  });

  it("is driven by the random source", () => {
    const zeros = () => new Uint8Array(8);
    expect(generateDiscountCode(zeros)).toBe("AAAAAAAA");
  });
});
