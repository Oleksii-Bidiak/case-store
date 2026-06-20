import { formatMoney } from "./formatMoney";

// uk-UA formatting uses non-breaking spaces (U+00A0) for the thousands
// separator and before the currency symbol. Normalise to a plain space so the
// assertions stay readable regardless of the exact whitespace codepoint.
const norm = (s: string) => s.replace(/ /g, " ");

describe("formatMoney", () => {
  it("formats a whole-thousand amount with a space separator and ₴", () => {
    const result = norm(formatMoney("1299"));
    expect(result).toContain("₴");
    expect(result).toContain("1 299");
  });

  it("formats a fractional amount with a comma decimal", () => {
    expect(norm(formatMoney("29.99"))).toBe("29,99 ₴");
  });

  it("formats zero without decimals", () => {
    expect(norm(formatMoney("0"))).toBe("0 ₴");
  });

  it("drops trailing .00 on whole amounts", () => {
    expect(norm(formatMoney("1299.00"))).toBe("1 299 ₴");
  });

  it("returns the original input for a non-numeric value", () => {
    expect(formatMoney("not-a-number")).toBe("not-a-number");
  });
});
