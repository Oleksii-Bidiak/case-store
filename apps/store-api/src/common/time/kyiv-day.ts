/**
 * The shop's calendar day, in Kyiv (TASK-787, moved to `common/` by TASK-685).
 *
 * The admin order filter's `dateFrom` / `dateTo` are CALENDAR dates — "orders
 * from the 24th" means the shop's 24th, start to finish. Parsed as-is,
 * `new Date('2026-09-24')` is UTC midnight (03:00 in Kyiv in summer), so as an
 * upper bound it cut off the whole day: `dateFrom = dateTo = today` returned
 * nothing, and the CSV export built from the same WHERE agreed.
 *
 * It used to live in the order module on purpose: a `common/` date helper
 * invites every module to decide what "a day" is without asking whose day.
 * Plan 188 is the case that changes the answer — the order filter, the
 * `/analytics` reports and the dashboard must now agree on ONE day, and two
 * copies of "the Kyiv day" are how they would drift apart. "Whose day" is
 * answered here, once: Kyiv's, for every module that buckets by day.
 *
 * Two halves that must never disagree:
 * - the JS half ({@link kyivDayRange}) turns a calendar day into the half-open
 *   instant range a WHERE filters on;
 * - the SQL half ({@link kyivDaySql}) turns a stored instant into the calendar
 *   day a GROUP BY buckets on.
 * An order at 22:30 UTC on the 31st is inside the 1st by both. The dashboard's
 * old server-local-midnight filter beside a `DATE_TRUNC('day', NOW())` series
 * was the counter-example (`dashboard.repository.ts`, before TASK-694).
 */

import { Prisma } from '@prisma/client';

export const SHOP_TIME_ZONE = 'Europe/Kyiv';

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

/** A `YYYY-MM-DD` calendar day. */
export type CalendarDay = string;

const CALENDAR_DAY = /^\d{4}-\d{2}-\d{2}$/;

/** `true` for a well-formed, real `YYYY-MM-DD` day (`2026-02-30` is not one). */
export function isCalendarDay(value: string): boolean {
  if (!CALENDAR_DAY.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function formatDay({ year, month, day }: CalendarDate): CalendarDay {
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function parseDay(value: CalendarDay): CalendarDate {
  const [year, month, day] = value.split('-').map(Number);
  return { year, month, day };
}

/** The Kyiv calendar day `instant` falls on. */
export function kyivDateOf(instant: Date): CalendarDay {
  return formatDay(kyivWallClock(instant));
}

/** `value` shifted by `n` calendar days (negative goes back); month- and year-safe. */
export function addDays(value: CalendarDay, n: number): CalendarDay {
  const { year, month, day } = parseDay(value);
  const shifted = new Date(Date.UTC(year, month - 1, day + n));
  return formatDay({
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth() + 1,
    day: shifted.getUTCDate(),
  });
}

/** Calendar days from `from` to `to`, both included (`from = to` → 1). */
export function daysInclusive(from: CalendarDay, to: CalendarDay): number {
  const a = parseDay(from);
  const b = parseDay(to);
  const diff = Date.UTC(b.year, b.month - 1, b.day) - Date.UTC(a.year, a.month - 1, a.day);
  return Math.round(diff / 86_400_000) + 1;
}

/** The first day of the month `value` is in. */
export function monthStart(value: CalendarDay): CalendarDay {
  const { year, month } = parseDay(value);
  return formatDay({ year, month, day: 1 });
}

/** The last day of the month `value` is in. */
export function monthEnd(value: CalendarDay): CalendarDay {
  const { year, month } = parseDay(value);
  // Day 0 of the next month is the last day of this one.
  return formatDay({ year, month, day: new Date(Date.UTC(year, month, 0)).getUTCDate() });
}

/**
 * The SQL half: the Kyiv calendar day of a stored instant, as a `date`.
 *
 * Every timestamp column in this schema is `TIMESTAMP(3)` WITHOUT time zone,
 * holding UTC wall time. `col AT TIME ZONE 'Europe/Kyiv'` on such a column reads
 * it as KYIV wall time and converts the wrong way — a 2–3 hour error in the
 * opposite direction, which is what the plan-188 text would have shipped if
 * copied literally. The column must first be declared UTC, then shown in Kyiv.
 * The result does not depend on the session `TimeZone`, the other half of why
 * the dashboard was right only while everything happened to run in UTC.
 *
 * `column` is trusted SQL (a column reference such as `Prisma.raw('o.created_at')`),
 * never user input. The zone is inlined as a literal, not bound: the same
 * expression usually appears in both SELECT and GROUP BY, and Postgres does not
 * treat `$1` and `$2` as the same expression — a bound zone fails with "must
 * appear in the GROUP BY clause".
 */
export function kyivDaySql(column: Prisma.Sql): Prisma.Sql {
  return Prisma.sql`((${column} AT TIME ZONE 'UTC') AT TIME ZONE ${Prisma.raw(`'${SHOP_TIME_ZONE}'`)})::date`;
}
