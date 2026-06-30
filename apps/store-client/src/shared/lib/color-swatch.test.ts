import { colorSwatch } from "./color-swatch";

describe("colorSwatch (TASK-077)", () => {
  it("resolves exact base colours case-insensitively", () => {
    expect(colorSwatch("Black").css).toBe("#1a1a1a");
    expect(colorSwatch("black").css).toBe("#1a1a1a");
    expect(colorSwatch("RED").css).toBe("#dc2626");
  });

  it("flags light colours so callers can add a visible ring", () => {
    expect(colorSwatch("White").isLight).toBe(true);
    expect(colorSwatch("Clear").isLight).toBe(true);
    expect(colorSwatch("Black").isLight).toBe(false);
  });

  it("resolves multi-word values to the most specific base token", () => {
    // "navy" is matched before "blue".
    expect(colorSwatch("Navy Blue").css).toBe("#1e3a8a");
    expect(colorSwatch("Frosted Black").css).toBe("#1a1a1a");
  });

  it("falls back to a neutral grey for unrecognised values", () => {
    expect(colorSwatch("Unicorn Sparkle").css).toBe("#d1d5db");
  });
});
