import {
  formatDate,
  formatDateTime,
  formatRelative,
  formatTime,
} from "./formatDate";

/**
 * Normalise every Unicode space variant (NBSP / narrow NBSP, which ICU likes to
 * slip into date and time patterns) to a plain space, so the assertions below
 * test the FORMAT — digits, dots, comma, colon — and not which flavour of space
 * the bundled ICU shipped this month.
 */
const norm = (s: string) => s.replace(/[\s  ]+/g, " ");

// 2026-09-09 15:40 UTC is 18:40 in Kyiv (EEST, UTC+3). The three-hour gap is the
// whole point of these tests: if the explicit `timeZone: "Europe/Kyiv"` is ever
// dropped, CI (and the production container) run in UTC and this renders 15:40.
const SUMMER_UTC = "2026-09-09T15:40:00.000Z";
// 2026-01-15 15:40 UTC is 17:40 in Kyiv (EET, UTC+2) — the same assertion on the
// other side of DST, so a hard-coded "+3" fudge fails too.
const WINTER_UTC = "2026-01-15T15:40:00.000Z";

describe("formatDateTime", () => {
  it("renders the plan's example as 09.09.2026, 18:40", () => {
    expect(norm(formatDateTime(SUMMER_UTC))).toBe("09.09.2026, 18:40");
  });

  it("renders in Kyiv time, not UTC (summer, UTC+3)", () => {
    expect(norm(formatDateTime(SUMMER_UTC))).toContain("18:40");
    expect(norm(formatDateTime(SUMMER_UTC))).not.toContain("15:40");
  });

  it("follows Kyiv across DST (winter, UTC+2)", () => {
    expect(norm(formatDateTime(WINTER_UTC))).toBe("15.01.2026, 17:40");
  });

  it("uses a 24-hour clock with no AM/PM marker", () => {
    const evening = norm(formatDateTime("2026-09-09T18:05:00.000Z")); // 21:05 Kyiv
    expect(evening).toBe("09.09.2026, 21:05");
    expect(evening).not.toMatch(/[AP]M/i);
  });

  it("accepts a Date and epoch milliseconds as well as an ISO string", () => {
    const iso = norm(formatDateTime(SUMMER_UTC));
    expect(norm(formatDateTime(new Date(SUMMER_UTC)))).toBe(iso);
    expect(norm(formatDateTime(new Date(SUMMER_UTC).getTime()))).toBe(iso);
  });

  it("returns the input unchanged when it is not a usable date", () => {
    expect(formatDateTime("not-a-date")).toBe("not-a-date");
    expect(formatDateTime(Number.NaN)).toBe("NaN");
    expect(formatDateTime("")).toBe("");
  });
});

describe("formatDate", () => {
  it("renders a day-first Ukrainian date with a four-digit year", () => {
    expect(norm(formatDate(SUMMER_UTC))).toBe("09.09.2026");
  });

  it("uses the Kyiv calendar day, not the UTC one", () => {
    // 22:30 UTC on the 9th is already 01:30 on the 10th in Kyiv.
    expect(norm(formatDate("2026-09-09T22:30:00.000Z"))).toBe("10.09.2026");
  });

  it("returns the input unchanged when it is not a usable date", () => {
    expect(formatDate("—")).toBe("—");
  });
});

describe("formatTime", () => {
  it("renders a 24-hour Kyiv time only", () => {
    expect(norm(formatTime(SUMMER_UTC))).toBe("18:40");
  });

  it("pads the hour and keeps midnight at 00", () => {
    // 21:07 UTC is 00:07 on the next Kyiv day.
    expect(norm(formatTime("2026-09-09T21:07:00.000Z"))).toBe("00:07");
  });

  it("returns the input unchanged when it is not a usable date", () => {
    expect(formatTime("nope")).toBe("nope");
  });
});

describe("formatRelative", () => {
  const now = new Date("2026-09-09T15:40:00.000Z");
  const ago = (ms: number) => formatRelative(new Date(now.getTime() - ms), now);

  it("says «зараз» under a second", () => {
    expect(norm(ago(400))).toBe("зараз");
  });

  it("gets Ukrainian plural forms right for minutes", () => {
    // Intl owns these forms; hand-rolled pluralisation is what produces
    // "5 хвилини тому".
    expect(norm(ago(60_000))).toBe("1 хвилину тому");
    expect(norm(ago(2 * 60_000))).toBe("2 хвилини тому");
    expect(norm(ago(5 * 60_000))).toBe("5 хвилин тому");
  });

  it("steps up to hours, days, months and years", () => {
    expect(norm(ago(3 * 60 * 60_000))).toBe("3 години тому");
    expect(norm(ago(24 * 60 * 60_000))).toBe("учора");
    expect(norm(ago(11 * 24 * 60 * 60_000))).toBe("11 днів тому");
    expect(norm(ago(30 * 24 * 60 * 60_000))).toBe("минулого місяця");
    expect(norm(ago(365 * 24 * 60 * 60_000))).toBe("минулого року");
  });

  it("handles the future direction too", () => {
    expect(
      norm(formatRelative(new Date(now.getTime() + 5 * 60 * 60_000), now)),
    ).toBe("через 5 годин");
  });

  it("returns the input unchanged when it is not a usable date", () => {
    expect(formatRelative("whenever", now)).toBe("whenever");
  });
});
