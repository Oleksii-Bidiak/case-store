import { formatKop, kopToInput, parseKop } from "./money-kop";

/** Intl groups with NBSP / narrow NBSP depending on the ICU build. */
const plain = (value: string) => value.replace(/[  ]/g, " ");

describe("money-kop (R2, TASK-2047)", () => {
  it("formats integer kopecks through the admin money formatter", () => {
    expect(plain(formatKop(123405))).toBe("1 234,05 ₴");
    expect(plain(formatKop(129900))).toBe("1 299 ₴");
    expect(plain(formatKop(5))).toBe("0,05 ₴");
    expect(plain(formatKop(0))).toBe("0 ₴");
    expect(plain(formatKop(-10050))).toBe("-100,5 ₴");
  });

  it("prefills a field without grouping, with a comma, and blank for ≤ 0", () => {
    expect(kopToInput(123450)).toBe("1234,50");
    expect(kopToInput(129900)).toBe("1299");
    expect(kopToInput(7)).toBe("0,07");
    expect(kopToInput(0)).toBe("");
    expect(kopToInput(-100)).toBe("");
  });

  it("parses what an operator types into whole kopecks by string arithmetic", () => {
    expect(parseKop("1 234,50")).toBe(123450);
    expect(parseKop("1234.5")).toBe(123450);
    expect(parseKop("499")).toBe(49900);
    expect(parseKop("0,07")).toBe(7);
    expect(parseKop("1 299 ₴")).toBe(129900);
    expect(parseKop("1299 грн")).toBe(129900);
    // The classic float trap: 1.13 * 100 = 112.99999999999999.
    expect(parseKop("1,13")).toBe(113);
    expect(parseKop("0")).toBe(0);
  });

  it("refuses anything that is not an amount", () => {
    for (const raw of [
      "",
      "abc",
      "1,234",
      "-5",
      "1.2.3",
      "12,",
      ",5",
      "999999999",
    ]) {
      expect(parseKop(raw)).toBeNull();
    }
  });

  it("round-trips the prefill", () => {
    for (const kop of [1, 99, 100, 123405, 200_000_000]) {
      expect(parseKop(kopToInput(kop))).toBe(kop);
    }
  });
});
