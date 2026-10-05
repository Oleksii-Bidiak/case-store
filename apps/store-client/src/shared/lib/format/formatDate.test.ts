import { formatDate, formatDayMonth, formatTime } from "./formatDate";

describe("formatDate", () => {
  it("formats the long form with the genitive month and no «р.» suffix", () => {
    expect(formatDate("2026-06-12T09:00:00Z")).toBe("12 червня 2026");
  });

  it("formats the short form with Intl's abbreviated month", () => {
    expect(formatDate("2026-06-12T09:00:00Z", "short")).toBe("12 черв. 2026");
    expect(formatDate("2026-03-05T09:00:00Z", "short")).toBe("5 бер. 2026");
  });

  it("reads the day in Kyiv, not in the runtime's zone", () => {
    // 22:30 UTC on the 11th is 01:30 on the 12th in Kyiv (UTC+3 in summer):
    // a UTC server and a browser anywhere must both print the 12th.
    expect(formatDate("2026-06-11T22:30:00Z")).toBe("12 червня 2026");
    // And the last minute of the Kyiv year stays in it.
    expect(formatDate("2026-12-31T21:59:00Z")).toBe("31 грудня 2026");
    expect(formatDate("2026-12-31T22:00:00Z")).toBe("1 січня 2027");
  });

  it("accepts a Date and epoch milliseconds", () => {
    const instant = new Date("2026-09-09T12:00:00Z");
    expect(formatDate(instant)).toBe("9 вересня 2026");
    expect(formatDate(instant.getTime())).toBe("9 вересня 2026");
  });

  it("returns an unusable input unchanged instead of «Invalid Date»", () => {
    expect(formatDate("not-a-date")).toBe("not-a-date");
  });
});

describe("formatDayMonth", () => {
  it("formats the day and genitive month without the year", () => {
    expect(formatDayMonth("2026-06-11T22:30:00Z")).toBe("12 червня");
  });

  it("returns an unusable input unchanged", () => {
    expect(formatDayMonth("nope")).toBe("nope");
  });
});

describe("formatTime (TASK-217)", () => {
  it("prints 24-hour Kyiv wall-clock time", () => {
    // 11:52 UTC is 14:52 in Kyiv in summer (UTC+3).
    expect(formatTime("2026-06-12T11:52:00Z")).toBe("14:52");
    // Midnight reads 00, not 24.
    expect(formatTime("2026-06-11T21:05:00Z")).toBe("00:05");
  });

  it("returns an unusable input unchanged", () => {
    expect(formatTime("nope")).toBe("nope");
  });
});
