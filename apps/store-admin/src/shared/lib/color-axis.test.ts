import {
  COLOR_AXIS_KEYS,
  colorsInUse,
  isColorAxis,
  readColorAxis,
} from "./color-axis";

/**
 * The admin's half of the colour vocabulary (TASK-487).
 *
 * It exists because the three workspaces share nothing at build time, and it is
 * pinned here because the previous arrangement — the list inlined in components
 * — drifted and made colour dots vanish catalogue-wide (plan 170, TASK-364).
 */
describe("color-axis (TASK-487)", () => {
  it("holds exactly the three spellings the API holds", () => {
    expect([...COLOR_AXIS_KEYS].sort()).toEqual(["color", "colour", "колір"]);
  });

  it("matches an axis case- and whitespace-insensitively", () => {
    expect(isColorAxis(" Колір ")).toBe(true);
    expect(isColorAxis("COLOUR")).toBe(true);
    expect(isColorAxis("Розмір")).toBe(false);
  });

  describe("readColorAxis", () => {
    it("reads the seed spelling and the import spelling alike", () => {
      expect(readColorAxis({ Колір: "Чорний" })).toBe("Чорний");
      expect(readColorAxis({ color: "Black" })).toBe("Black");
    });

    it("trims, and treats a blank as no colour", () => {
      expect(readColorAxis({ color: "  Чорний  " })).toBe("Чорний");
      expect(readColorAxis({ color: "   " })).toBeNull();
    });

    it("survives every shape the JSON column can hold", () => {
      expect(readColorAxis(null)).toBeNull();
      expect(readColorAxis(undefined)).toBeNull();
      expect(readColorAxis("Чорний")).toBeNull();
      expect(readColorAxis(["Чорний"])).toBeNull();
      expect(readColorAxis({ color: 42 })).toBeNull();
    });

    it("ignores axes that are not colour", () => {
      expect(readColorAxis({ Розмір: "L", "Пам'ять": "256 ГБ" })).toBeNull();
    });
  });

  describe("colorsInUse", () => {
    it("collects the distinct colours of the rows on screen, collated for UA", () => {
      expect(
        colorsInUse([
          { attributes: { Колір: "Чорний" } },
          { attributes: { color: "Білий" } },
          { attributes: { Колір: "Чорний" } },
          { attributes: {} },
          {},
        ]),
      ).toEqual(["Білий", "Чорний"]);
    });

    it("returns an empty list rather than throwing on a colourless page", () => {
      expect(colorsInUse([])).toEqual([]);
      expect(colorsInUse([{ attributes: null }])).toEqual([]);
    });
  });
});
