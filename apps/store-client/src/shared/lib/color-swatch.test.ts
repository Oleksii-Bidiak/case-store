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

  it("falls back to a neutral swatch for unrecognised values", () => {
    const swatch = colorSwatch("Unicorn Sparkle");
    expect(swatch.isUnknown).toBe(true);
    // The fallback is a neutral gradient (a valid CSS background value), so it
    // never pretends to be a real colour.
    expect(swatch.css).toContain("linear-gradient");
    expect(swatch.isLight).toBe(true);
  });
});

describe("colorSwatch — extended palette (TASK-215)", () => {
  it("resolves every colour used in the seed data to a real swatch", () => {
    // apps/store-api/prisma/seed.ts — distinct `attributes.color` values.
    const seedColors = [
      "Black",
      "White",
      "Blue",
      "Red",
      "Clear",
      "Frosted Black",
      "Navy Blue",
      "Transparent",
      "Silver",
      "Gray",
    ];
    for (const value of seedColors) {
      const swatch = colorSwatch(value);
      expect(swatch.isUnknown).toBeUndefined();
      expect(swatch.css).toMatch(/^#/);
    }
  });

  it("resolves Ukrainian colour names, including adjective inflections", () => {
    expect(colorSwatch("Чорний").css).toBe("#1a1a1a");
    expect(colorSwatch("чорна").css).toBe("#1a1a1a"); // feminine inflection
    expect(colorSwatch("Білий").css).toBe("#f5f5f5");
    expect(colorSwatch("Синій").css).toBe("#2563eb");
    expect(colorSwatch("Темно-синій").css).toBe("#1e3a8a"); // navy beats "син"
    expect(colorSwatch("Червоний").css).toBe("#dc2626");
    expect(colorSwatch("Зелений").css).toBe("#16a34a");
    expect(colorSwatch("Сірий").css).toBe("#9ca3af");
    expect(colorSwatch("Срібний").css).toBe("#c0c0c0");
    expect(colorSwatch("Сріблястий").css).toBe("#c0c0c0");
    expect(colorSwatch("Золотий").css).toBe("#d4af37");
    expect(colorSwatch("Рожевий").css).toBe("#ec4899");
    expect(colorSwatch("Фіолетовий").css).toBe("#7c3aed");
    expect(colorSwatch("Бежевий").css).toBe("#d9c7a7");
    expect(colorSwatch("Коричневий").css).toBe("#8b5e3c");
    expect(colorSwatch("Оранжевий").css).toBe("#f97316");
    expect(colorSwatch("Помаранчевий").css).toBe("#f97316");
    expect(colorSwatch("Жовтий").css).toBe("#eab308");
    expect(colorSwatch("Бірюзовий").css).toBe("#0d9488");
    expect(colorSwatch("М'ятний").css).toBe("#b3e0cf");
    expect(colorSwatch("Лавандовий").css).toBe("#c8b6e2");
    expect(colorSwatch("Блакитний").css).toBe("#38bdf8");
    expect(colorSwatch("Прозорий").isLight).toBe(true);
  });

  it("resolves Apple finish names to their specific shades, not generic bases", () => {
    expect(colorSwatch("Midnight").css).toBe("#0f172a");
    expect(colorSwatch("Starlight").isLight).toBe(true);
    // "Space Gray" must NOT collapse to generic gray.
    expect(colorSwatch("Space Gray").css).toBe("#4a4a4d");
    expect(colorSwatch("Space Grey").css).toBe("#4a4a4d");
    expect(colorSwatch("Space Black").css).toBe("#1c1c1e");
    expect(colorSwatch("Graphite").css).toBe("#3a3a3c");
    // "Product Red" is Apple's deep red, not the generic red token.
    expect(colorSwatch("Product Red").css).toBe("#c8102e");
    expect(colorSwatch("Lavender").isLight).toBe(true);
    expect(colorSwatch("Mint").isLight).toBe(true);
  });

  it("never returns an unknown swatch for the documented English base names", () => {
    const names = [
      "beige",
      "brown",
      "teal",
      "gold",
      "pink",
      "purple",
      "orange",
      "yellow",
      "green",
      "grey",
      "silver",
    ];
    for (const value of names) {
      expect(colorSwatch(value).isUnknown).toBeUndefined();
    }
  });
});
