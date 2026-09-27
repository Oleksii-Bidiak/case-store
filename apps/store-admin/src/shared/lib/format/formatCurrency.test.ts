import { formatCurrency } from "./formatCurrency";

/** Intl groups with NBSP / narrow NBSP depending on the ICU build — compare on plain spaces. */
const plain = (value: string) => value.replace(/[\u00a0\u202f]/g, " ");

describe("formatCurrency — the admin's one money formatter (TASK-801)", () => {
  it("formats like the storefront: grouped, comma decimals, a literal ₴", () => {
    expect(plain(formatCurrency("1299"))).toBe("1 299 ₴");
    expect(plain(formatCurrency("1299.00"))).toBe("1 299 ₴");
    expect(plain(formatCurrency("29.99"))).toBe("29,99 ₴");
    expect(plain(formatCurrency(29.9))).toBe("29,9 ₴");
    expect(plain(formatCurrency(0))).toBe("0 ₴");
  });

  it("never lets Intl choose the currency symbol (no «грн», no style:currency)", () => {
    // `style: "currency"` renders «грн» under Node ICU and «₴» in browsers —
    // the storefront's hydration mismatch. The sign is appended by hand.
    expect(formatCurrency("1234567.5")).not.toMatch(/грн|UAH/);
    expect(plain(formatCurrency("1234567.5"))).toBe("1 234 567,5 ₴");
  });

  it("rounds to at most two fraction digits", () => {
    expect(plain(formatCurrency("10.005"))).toMatch(/^10(,01)? ₴$/);
    expect(plain(formatCurrency("10.123"))).toBe("10,12 ₴");
  });

  it("returns a non-numeric input unchanged", () => {
    expect(formatCurrency("n/a")).toBe("n/a");
  });
});
