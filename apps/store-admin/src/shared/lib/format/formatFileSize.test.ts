import { formatFileSize } from "./formatFileSize";

/** Strip whitespace (incl. NBSP/narrow-NBSP from uk-UA grouping). */
const noSpace = (s: string) => s.replace(/[\s  ]/g, "");

describe("formatFileSize", () => {
  it("reports whole bytes for a small file", () => {
    expect(noSpace(formatFileSize(512) ?? "")).toBe("512байт");
  });

  it("steps up to kilobytes and megabytes in binary units", () => {
    // Binary steps, because that is what file managers and hosting dashboards
    // report — a library disagreeing with them invites a bug report about
    // neither.
    expect(noSpace(formatFileSize(184320) ?? "")).toBe("180КБ");
    // One decimal while it still carries information; "," or "." depending on
    // the ICU build.
    expect(noSpace(formatFileSize(1024 * 1024 * 2.5) ?? "")).toMatch(
      /^2[.,]5МБ$/,
    );
  });

  it("answers null for a size we do not know", () => {
    // The TASK-441 backfill stored 0 for every asset made out of an existing
    // product photo: those numbers live inside files a migration never opened.
    // «0 байт» would be a confident lie about a picture that plainly exists.
    expect(formatFileSize(0)).toBeNull();
    expect(formatFileSize(-1)).toBeNull();
    expect(formatFileSize(Number.NaN)).toBeNull();
  });
});
