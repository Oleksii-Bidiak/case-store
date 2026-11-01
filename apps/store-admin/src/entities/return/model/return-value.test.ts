import { returnLinesValueKop } from "./return-value";

describe("returnLinesValueKop (R2, TASK-2046)", () => {
  it("sums unit price × quantity in whole kopecks", () => {
    expect(
      returnLinesValueKop([
        { price: "499.00", quantity: 2 },
        { price: "29.99", quantity: 3 },
      ]),
    ).toBe(99800 + 8997);
  });

  it("does not drift on prices a float cannot hold", () => {
    // 1.13 * 100 = 112.99999999999999 — the string is split, never multiplied.
    expect(returnLinesValueKop([{ price: "1.13", quantity: 100 }])).toBe(11300);
  });

  it("is 0 for no lines", () => {
    expect(returnLinesValueKop([])).toBe(0);
  });

  it("is null when a line has no price — not a guessed figure", () => {
    expect(
      returnLinesValueKop([
        { price: "499.00", quantity: 1 },
        { price: null, quantity: 1 },
      ]),
    ).toBeNull();
  });
});
