import { dict } from "@/shared/config";
import { formatDate, formatDateTime } from "@/shared/lib";
import { bannerDisplayState, bannerWindowLines } from "./display-state";

const NOW = Date.parse("2026-10-01T09:00:00.000Z");
const DAY = 24 * 60 * 60 * 1000;
const iso = (ms: number) => new Date(ms).toISOString();

const base = {
  status: "DRAFT" as "DRAFT" | "SCHEDULED" | "PUBLISHED",
  publishedAt: null as string | null,
  scheduledAt: null as string | null,
  scheduledUntil: null as string | null,
};

describe("bannerDisplayState", () => {
  it("a published banner with no end is live", () => {
    expect(bannerDisplayState({ ...base, status: "PUBLISHED" }, NOW)).toBe(
      "live",
    );
  });

  it("a published banner whose end has passed is ended — not live", () => {
    expect(
      bannerDisplayState(
        { ...base, status: "PUBLISHED", scheduledUntil: iso(NOW - 1000) },
        NOW,
      ),
    ).toBe("ended");
  });

  it("scheduled stays scheduled; a draft is a draft", () => {
    expect(bannerDisplayState({ ...base, status: "SCHEDULED" }, NOW)).toBe(
      "scheduled",
    );
    expect(bannerDisplayState(base, NOW)).toBe("draft");
  });
});

describe("bannerWindowLines", () => {
  it("live with an end: «до …» and the days left, rounded up", () => {
    const until = NOW + 13 * DAY + 3600_000;
    expect(
      bannerWindowLines(
        { ...base, status: "PUBLISHED", scheduledUntil: iso(until) },
        NOW,
      ),
    ).toEqual({
      primary: dict.banners.windowUntil(formatDateTime(until)),
      secondary: dict.banners.windowDaysLeft(14),
    });
  });

  it("live without an end: «без кінця» and since when", () => {
    const since = NOW - 40 * DAY;
    expect(
      bannerWindowLines(
        { ...base, status: "PUBLISHED", publishedAt: iso(since) },
        NOW,
      ),
    ).toEqual({
      primary: dict.banners.windowEndless,
      secondary: dict.banners.windowFrom(formatDate(since)),
    });
  });

  it("scheduled: «з …» and «через N днів»", () => {
    const at = NOW + 9 * DAY;
    expect(
      bannerWindowLines(
        { ...base, status: "SCHEDULED", scheduledAt: iso(at) },
        NOW,
      ),
    ).toEqual({
      primary: dict.banners.windowFrom(formatDateTime(at)),
      secondary: dict.banners.windowDaysUntil(9),
    });
  });

  it("a scheduled banner with no instant has no window — never «Invalid Date»", () => {
    expect(bannerWindowLines({ ...base, status: "SCHEDULED" }, NOW)).toEqual(
      {},
    );
  });

  it("a draft has no window", () => {
    expect(bannerWindowLines(base, NOW)).toEqual({});
  });
});
