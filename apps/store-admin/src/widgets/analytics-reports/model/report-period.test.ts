import {
  previousRangeOf,
  readReportPeriod,
  reportPeriodToQuery,
  reportPeriodToUrl,
  validateCustomRange,
} from "./report-period";

/** TASK-692 — the report period as the URL holds it. */

const TODAY = "2026-10-05";
const read = (query: string) =>
  readReportPeriod(new URLSearchParams(query), TODAY);

describe("readReportPeriod", () => {
  it("defaults to 30 days when the URL says nothing", () => {
    expect(read("")).toEqual({ preset: "30d", from: "", to: "" });
  });

  it("reads every known preset, and ignores from/to on a non-custom one", () => {
    for (const preset of ["7d", "30d", "90d", "this-month", "last-month"]) {
      expect(read(`preset=${preset}&from=2026-09-01&to=2026-09-30`)).toEqual({
        preset,
        from: "",
        to: "",
      });
    }
  });

  it("reads a valid custom range", () => {
    expect(read("preset=custom&from=2026-08-01&to=2026-08-31")).toEqual({
      preset: "custom",
      from: "2026-08-01",
      to: "2026-08-31",
    });
  });

  it("falls back to 30 days for an unknown preset", () => {
    expect(read("preset=year")).toEqual({ preset: "30d", from: "", to: "" });
  });

  it.each([
    ["no dates", "preset=custom"],
    ["only from", "preset=custom&from=2026-08-01"],
    ["only to", "preset=custom&to=2026-08-31"],
    ["a malformed day", "preset=custom&from=2026-8-1&to=2026-08-31"],
    ["an impossible day", "preset=custom&from=2026-02-30&to=2026-03-02"],
    ["from after to", "preset=custom&from=2026-09-02&to=2026-09-01"],
    ["a future end", "preset=custom&from=2026-10-01&to=2026-10-06"],
  ])("falls back to 30 days for custom with %s", (_label, query) => {
    expect(read(query)).toEqual({ preset: "30d", from: "", to: "" });
  });
});

describe("reportPeriodToUrl", () => {
  it("leaves the default preset out of the URL and clears the range", () => {
    expect(reportPeriodToUrl({ preset: "30d", from: "", to: "" })).toEqual({
      preset: undefined,
      from: undefined,
      to: undefined,
    });
  });

  it("writes a preset and drops a stale custom range", () => {
    expect(
      reportPeriodToUrl({
        preset: "90d",
        from: "2026-08-01",
        to: "2026-08-31",
      }),
    ).toEqual({ preset: "90d", from: undefined, to: undefined });
  });

  it("writes custom with both days", () => {
    expect(
      reportPeriodToUrl({
        preset: "custom",
        from: "2026-08-01",
        to: "2026-08-31",
      }),
    ).toEqual({ preset: "custom", from: "2026-08-01", to: "2026-08-31" });
  });
});

describe("reportPeriodToQuery", () => {
  it("sends the default preset explicitly", () => {
    expect(reportPeriodToQuery({ preset: "30d", from: "", to: "" })).toEqual({
      preset: "30d",
    });
  });

  it("sends from/to for custom only", () => {
    expect(
      reportPeriodToQuery({
        preset: "custom",
        from: "2026-08-01",
        to: "2026-08-31",
      }),
    ).toEqual({ preset: "custom", from: "2026-08-01", to: "2026-08-31" });
  });
});

describe("validateCustomRange", () => {
  it("accepts a one-day range, including today", () => {
    expect(validateCustomRange(TODAY, TODAY, TODAY)).toBeNull();
    expect(validateCustomRange("2026-08-01", "2026-08-01", TODAY)).toBeNull();
  });

  it("asks for both days when one is empty or not a day", () => {
    expect(validateCustomRange("", "2026-08-31", TODAY)).toBe("missing");
    expect(validateCustomRange("2026-08-01", "", TODAY)).toBe("missing");
    expect(validateCustomRange("2026-02-30", "2026-03-01", TODAY)).toBe(
      "missing",
    );
  });

  it("refuses from after to", () => {
    expect(validateCustomRange("2026-09-02", "2026-09-01", TODAY)).toBe(
      "order",
    );
  });

  it("refuses an end after today (Kyiv)", () => {
    expect(validateCustomRange("2026-10-01", "2026-10-06", TODAY)).toBe(
      "future",
    );
  });

  it("accepts 366 days and refuses 367", () => {
    // 2025-10-05 … 2026-10-05 is 366 days, both ends included.
    expect(validateCustomRange("2025-10-05", TODAY, TODAY)).toBeNull();
    expect(validateCustomRange("2025-10-04", TODAY, TODAY)).toBe("tooLong");
  });
});

describe("previousRangeOf", () => {
  it("is the same number of days right before the range", () => {
    expect(previousRangeOf("2026-08-01", "2026-08-31")).toEqual({
      from: "2026-07-01",
      to: "2026-07-31",
      days: 31,
    });
  });

  it("is the day before for a one-day range", () => {
    expect(previousRangeOf("2026-03-01", "2026-03-01")).toEqual({
      from: "2026-02-28",
      to: "2026-02-28",
      days: 1,
    });
  });

  it("crosses a year boundary by calendar days", () => {
    expect(previousRangeOf("2026-01-01", "2026-01-10")).toEqual({
      from: "2025-12-22",
      to: "2025-12-31",
      days: 10,
    });
  });
});
