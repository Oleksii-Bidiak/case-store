import {
  formatDayRange,
  formatDayRangeDigits,
  formatPeriodLabel,
  formatPreviousLabel,
  formatSigned,
} from "./format";

/** TASK-692 — the period bar's words (artboard ДН-8.1). */

const period = {
  preset: "30d" as const,
  from: "2026-09-06",
  to: "2026-10-05",
  days: 30,
  previousFrom: "2026-08-07",
  previousTo: "2026-09-05",
  previousDays: 30,
};

describe("period labels", () => {
  it("says the period with its length", () => {
    expect(formatPeriodLabel(period)).toBe(
      "6 вересня — 5 жовтня 2026 · 30 днів",
    );
  });

  it("says the comparison range without the year it shares", () => {
    expect(formatPreviousLabel(period)).toBe("7 серпня — 5 вересня");
  });

  it("keeps the year on a comparison range in another year", () => {
    expect(
      formatPreviousLabel({
        ...period,
        from: "2026-01-01",
        to: "2026-01-10",
        previousFrom: "2025-12-22",
        previousTo: "2025-12-31",
      }),
    ).toBe("22–31 грудня 2025");
  });

  it("collapses one month and one day", () => {
    expect(formatDayRange("2026-09-01", "2026-09-30")).toBe(
      "1–30 вересня 2026",
    );
    expect(formatDayRange("2026-10-01", "2026-10-01")).toBe("1 жовтня 2026");
  });

  it("says both years across a year boundary", () => {
    expect(formatDayRange("2025-12-20", "2026-01-10")).toBe(
      "20 грудня 2025 — 10 січня 2026",
    );
  });

  it("counts a single day in the singular", () => {
    expect(
      formatPeriodLabel({
        ...period,
        from: "2026-10-01",
        to: "2026-10-01",
        days: 1,
      }),
    ).toBe("1 жовтня 2026 · 1 день");
  });
});

describe("formatDayRangeDigits", () => {
  it("is compact within a year and full across one", () => {
    expect(formatDayRangeDigits("2026-07-01", "2026-07-31")).toBe(
      "01.07–31.07.2026",
    );
    expect(formatDayRangeDigits("2025-12-01", "2026-01-31")).toBe(
      "01.12.2025–31.01.2026",
    );
    expect(formatDayRangeDigits("2026-07-01", "2026-07-01")).toBe("01.07.2026");
  });
});

describe("formatSigned", () => {
  it("uses a plus, a true minus and a decimal comma", () => {
    expect(formatSigned(12)).toBe("+12");
    expect(formatSigned(-4)).toBe("−4");
    expect(formatSigned(1.4)).toBe("+1,4");
    expect(formatSigned(0)).toBe("0");
  });
});
