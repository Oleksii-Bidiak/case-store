import { COLOR_AXIS_KEYS, COLOR_SPEC_KEY, isColorAxis } from "./color-axis";

/**
 * The storefront half of the colour vocabulary (TASK-487).
 *
 * Its whole reason for existing is that the copies drifted once before: the
 * storefront accepted `колір` and the server's copy did not, so colour dots
 * vanished from every card while the PDP still rendered swatches (plan 170,
 * TASK-364). These cases pin the exact list, so a change here is a change
 * somebody has to make deliberately — and then mirror in
 * `apps/store-api/src/common/color-axis.ts`.
 */
describe("color-axis (TASK-487)", () => {
  it("accepts every spelling this repository actually writes", () => {
    // `Колір` is the seed's; `color` is the XLSX import's; `colour` is the
    // spelling an operator can type. All three exist in the database today.
    expect(isColorAxis("Колір")).toBe(true);
    expect(isColorAxis("color")).toBe(true);
    expect(isColorAxis("colour")).toBe(true);
  });

  it("is case- and whitespace-insensitive", () => {
    expect(isColorAxis("  COLOR ")).toBe(true);
    expect(isColorAxis("КОЛІР")).toBe(true);
  });

  it("rejects other axes", () => {
    expect(isColorAxis("Розмір")).toBe(false);
    expect(isColorAxis("Пам'ять")).toBe(false);
    expect(isColorAxis("colors")).toBe(false);
    expect(isColorAxis("")).toBe(false);
  });

  it("keeps the facet key latin — it is half of a catalogue URL", () => {
    expect(COLOR_SPEC_KEY).toBe("color");
    expect(COLOR_AXIS_KEYS.has(COLOR_SPEC_KEY)).toBe(true);
  });

  it("holds exactly the three spellings the server holds", () => {
    expect([...COLOR_AXIS_KEYS].sort()).toEqual(["color", "colour", "колір"]);
  });
});
