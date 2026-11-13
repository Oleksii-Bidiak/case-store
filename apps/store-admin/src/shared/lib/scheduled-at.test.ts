import { isPastKyivDateTimeLocal } from "./scheduled-at";

// 2026-11-12 12:00 Kyiv (UTC+2 in November) = 10:00 UTC.
const NOW = new Date("2026-11-12T10:00:00.000Z");

describe("isPastKyivDateTimeLocal (TASK-1984)", () => {
  it("is true for a moment before now, and for now itself", () => {
    expect(isPastKyivDateTimeLocal("2026-11-12T11:59", NOW)).toBe(true);
    expect(isPastKyivDateTimeLocal("2026-11-12T12:00", NOW)).toBe(true);
  });

  it("is false for a moment after now, read as Kyiv time", () => {
    expect(isPastKyivDateTimeLocal("2026-11-12T12:01", NOW)).toBe(false);
  });

  it("is false for an empty or unparseable value", () => {
    expect(isPastKyivDateTimeLocal("", NOW)).toBe(false);
    expect(isPastKyivDateTimeLocal(undefined, NOW)).toBe(false);
    expect(isPastKyivDateTimeLocal("not a date", NOW)).toBe(false);
  });
});
