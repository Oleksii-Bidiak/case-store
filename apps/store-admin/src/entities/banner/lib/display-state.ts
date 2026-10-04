import type { BannerEntity } from "@/shared/api";
import { dict } from "@/shared/config";
import { formatDate, formatDateTime } from "@/shared/lib";

/**
 * What a banner is doing on the storefront RIGHT NOW (wave 198, TASK-1073).
 *
 * Derived, never stored: the API keeps `status` plus the publication window
 * (`scheduledAt` … `scheduledUntil`), and the list speaks in what an operator
 * actually asks — «is it up?».
 *
 * - `live`      PUBLISHED and its window has not closed.
 * - `ended`     PUBLISHED but `scheduledUntil` has passed. Short-lived by
 *               nature: the API scheduler unpublishes it on its next tick and
 *               CLEARS the window, after which the banner is a plain draft —
 *               the API keeps no trace that it ever ran (an API tail).
 * - `scheduled` SCHEDULED — waits for `scheduledAt`.
 * - `draft`     everything else.
 */
export type BannerDisplayState = "live" | "scheduled" | "ended" | "draft";

export const BANNER_DISPLAY_STATES: readonly BannerDisplayState[] = [
  "live",
  "scheduled",
  "ended",
  "draft",
];

type BannerWindowFields = Pick<
  BannerEntity,
  "status" | "publishedAt" | "scheduledAt" | "scheduledUntil"
>;

const DAY_MS = 24 * 60 * 60 * 1000;

function instant(value: string | null | undefined): number | null {
  if (!value) return null;
  const time = Date.parse(value);
  return Number.isFinite(time) ? time : null;
}

export function bannerDisplayState(
  banner: BannerWindowFields,
  now: number,
): BannerDisplayState {
  if (banner.status === "SCHEDULED") return "scheduled";
  if (banner.status === "PUBLISHED") {
    const until = instant(banner.scheduledUntil);
    return until !== null && until <= now ? "ended" : "live";
  }
  return "draft";
}

/** Whole days to go, rounded UP: 3 hours left reads «1 день», not «0 днів». */
function daysUntil(target: number, now: number): number {
  return Math.max(1, Math.ceil((target - now) / DAY_MS));
}

/**
 * The window as two short lines — «до 15.10.2026, 23:59 · залишилось 14 днів»,
 * «з 10.10.2026, 00:00 · через 9 днів», «без кінця · з 09.08.2026». Either line
 * may be absent; a draft has no window at all.
 */
export function bannerWindowLines(
  banner: BannerWindowFields,
  now: number,
): { primary?: string; secondary?: string } {
  const d = dict.banners;
  const state = bannerDisplayState(banner, now);
  const until = instant(banner.scheduledUntil);

  if (state === "scheduled") {
    const at = instant(banner.scheduledAt);
    if (at === null) return {};
    return {
      primary: d.windowFrom(formatDateTime(at)),
      secondary: at > now ? d.windowDaysUntil(daysUntil(at, now)) : undefined,
    };
  }
  if (state === "ended" && until !== null) {
    return { primary: d.windowUntil(formatDateTime(until)) };
  }
  if (state === "live") {
    if (until !== null) {
      return {
        primary: d.windowUntil(formatDateTime(until)),
        secondary: d.windowDaysLeft(daysUntil(until, now)),
      };
    }
    const since = instant(banner.publishedAt);
    return {
      primary: d.windowEndless,
      secondary: since !== null ? d.windowFrom(formatDate(since)) : undefined,
    };
  }
  return {};
}
