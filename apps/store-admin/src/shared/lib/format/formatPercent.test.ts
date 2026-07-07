import { formatPercent } from "./formatPercent";

/** Strip all whitespace (incl. NBSP/narrow-NBSP from uk-UA grouping). */
const noSpace = (s: string) => s.replace(/[\s  ]/g, "");

describe("formatPercent", () => {
  it("formats a 0..1 fraction as a percentage (0.24 → 24%)", () => {
    const out = noSpace(formatPercent(0.24));
    expect(out).toContain("24");
    expect(out).toContain("%");
  });

  it("formats zero as 0%", () => {
    expect(noSpace(formatPercent(0))).toBe("0%");
  });

  it("accepts a numeric string", () => {
    const out = noSpace(formatPercent("0.5"));
    expect(out).toContain("50");
    expect(out).toContain("%");
  });

  it("returns the input unchanged when it is not a finite number", () => {
    expect(formatPercent(Number.NaN)).toBe("NaN");
  });
});
