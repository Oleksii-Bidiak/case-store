/**
 * The shop's calendar day, in Kyiv (TASK-787).
 *
 * The admin order filter's `dateFrom` / `dateTo` are CALENDAR dates — "orders
 * from the 24th" means the shop's 24th, start to finish. Parsed as-is,
 * `new Date('2026-09-24')` is UTC midnight (03:00 in Kyiv in summer), so as an
 * upper bound it cut off the whole day: `dateFrom = dateTo = today` returned
 * nothing, and the CSV export built from the same WHERE agreed.
 *
 * Kept in the order module on purpose: it is the one place that needs it, and
 * a `common/` date helper invites every other module to decide what "a day" is
 * without asking whose day.
 */

const SHOP_TIME_ZONE = 'Europe/Kyiv';

const KYIV_PARTS = new Intl.DateTimeFormat('en-US', {
  timeZone: SHOP_TIME_ZONE,
  hourCycle: 'h23',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
});

interface CalendarDate {
  year: number;
  month: number; // 1-12
  day: number;
}

/** Kyiv wall-clock fields of an instant. */
function kyivWallClock(
  instant: Date,
): CalendarDate & { hour: number; minute: number; second: number } {
  const parts = Object.fromEntries(
    KYIV_PARTS.formatToParts(instant).map((p) => [p.type, p.value]),
  ) as Record<string, string>;
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour: Number(parts.hour),
    minute: Number(parts.minute),
    second: Number(parts.second),
  };
}

/** Kyiv's offset from UTC at `instant`, in ms (+2h in winter, +3h in summer). */
function kyivOffsetMs(instant: Date): number {
  const w = kyivWallClock(instant);
  const wallAsUtc = Date.UTC(w.year, w.month - 1, w.day, w.hour, w.minute, w.second);
  return wallAsUtc - Math.floor(instant.getTime() / 1000) * 1000;
}

/**
 * The instant Kyiv's clocks read 00:00 on `date`. Midnight is never inside a
 * DST gap or overlap there (the switches are at 03:00 / 04:00), so one
 * correction of the offset guess is always enough.
 */
function kyivMidnight({ year, month, day }: CalendarDate): Date {
  const midnightAsUtc = Date.UTC(year, month - 1, day);
  const guess = midnightAsUtc - kyivOffsetMs(new Date(midnightAsUtc));
  return new Date(midnightAsUtc - kyivOffsetMs(new Date(guess)));
}

/**
 * The half-open instant range `[start, end)` of the Kyiv calendar day that
 * `value` names. A date-only string (`2026-09-24`) is that day; a full timestamp
 * is the Kyiv day the instant falls on (`…T23:30Z` on the 24th is the 25th).
 * Use `gte: start` and `lt: end` — `end` is the next day's midnight, which
 * also gives DST days their 23 or 25 hours.
 */
export function kyivDayRange(value: string): { start: Date; end: Date } {
  const { year, month, day } = kyivWallClock(new Date(value));
  const start = kyivMidnight({ year, month, day });
  // Date.UTC normalises day + 1 across month and year ends.
  const next = new Date(Date.UTC(year, month - 1, day + 1));
  const end = kyivMidnight({
    year: next.getUTCFullYear(),
    month: next.getUTCMonth() + 1,
    day: next.getUTCDate(),
  });
  return { start, end };
}
