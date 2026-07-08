import { formatDurationHours } from "./formatDurationHours";

describe("formatDurationHours (TASK-251)", () => {
  it("renders zero as '0 год'", () => {
    expect(formatDurationHours(0)).toBe("0 год");
  });

  it("renders a sub-two-day value as plain hours", () => {
    expect(formatDurationHours(36)).toBe("36 год");
  });

  it("rounds fractional hours to the nearest whole hour", () => {
    expect(formatDurationHours(36.4)).toBe("36 год");
    expect(formatDurationHours(36.6)).toBe("37 год");
  });

  it("breaks two days and beyond into days + hours", () => {
    expect(formatDurationHours(50)).toBe("2 дн 2 год");
  });

  it("falls back to the stringified input for a non-finite value", () => {
    expect(formatDurationHours(Number.NaN)).toBe("NaN");
    expect(formatDurationHours(Number.POSITIVE_INFINITY)).toBe("Infinity");
  });
});
