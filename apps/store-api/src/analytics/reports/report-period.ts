import { BadRequestException } from '@nestjs/common';
import {
  addDays,
  CalendarDay,
  daysInclusive,
  isCalendarDay,
  kyivDateOf,
  kyivDayRange,
  monthEnd,
  monthStart,
} from '../../common/time/kyiv-day';

/**
 * The period every `/analytics` report is asked about (TASK-685, plan 188).
 *
 * One resolver for all five reports and for the dashboard (TASK-694), so that
 * "the last 30 days" means the same 30 Kyiv days everywhere. It returns TWO
 * ranges: the chosen one and the one it is compared against — the owner chose
 * "comparison always", so a report without its comparison cannot be built.
 *
 * Comparison rules (owner's decision, 2026-09-26):
 * - `7d` / `30d` / `90d` / `custom` — the equal run of days right before;
 * - `this-month` (1…N) — days 1…N of the previous month, clipped to its end;
 * - `last-month` — the whole month before it (31 vs 30 days is fine: people
 *   compare August with July, not with "the 31 days before August").
 */

export const REPORT_PRESETS = ['7d', '30d', '90d', 'this-month', 'last-month', 'custom'] as const;
export type ReportPreset = (typeof REPORT_PRESETS)[number];

export const DEFAULT_REPORT_PRESET: ReportPreset = '30d';

/**
 * Longest custom range. A year plus a leap day — enough for "this year against
 * last year", short enough that a daily series stays a few hundred points.
 */
export const MAX_REPORT_DAYS = 366;

const ROLLING_DAYS: Readonly<Record<'7d' | '30d' | '90d', number>> = {
  '7d': 7,
  '30d': 30,
  '90d': 90,
};

/** One side of the comparison. */
export interface ReportRange {
  /** First Kyiv calendar day, included. */
  fromDay: CalendarDay;
  /** Last Kyiv calendar day, included. */
  toDay: CalendarDay;
  /** Kyiv midnight opening `fromDay` — filter with `>= start`. */
  start: Date;
  /** Kyiv midnight closing `toDay` — filter with `< end` (DST days get 23/25 h). */
  end: Date;
  /** Calendar days in the range. */
  days: number;
}

export interface ReportPeriod {
  preset: ReportPreset;
  current: ReportRange;
  previous: ReportRange;
}

export interface ReportPeriodInput {
  preset?: ReportPreset;
  from?: string;
  to?: string;
}

function range(fromDay: CalendarDay, toDay: CalendarDay): ReportRange {
  return {
    fromDay,
    toDay,
    start: kyivDayRange(fromDay).start,
    end: kyivDayRange(toDay).end,
    days: daysInclusive(fromDay, toDay),
  };
}

/**
 * The last `days` Kyiv calendar days at `now`, today included — the rolling
 * presets here, and the dashboard's fixed windows (30 days, 90 for repeat
 * buyers — TASK-694), so "the last 30 days" is the same 30 Kyiv days on the
 * dashboard and on `/analytics`.
 */
export function lastKyivDays(days: number, now: Date): ReportRange {
  const today = kyivDateOf(now);
  return range(addDays(today, -(days - 1)), today);
}

/** The equal run of days right before `current`. */
function precedingRange(current: ReportRange): ReportRange {
  const toDay = addDays(current.fromDay, -1);
  return range(addDays(toDay, -(current.days - 1)), toDay);
}

function customRange(from: string | undefined, to: string | undefined, today: CalendarDay) {
  if (from === undefined || to === undefined) {
    throw new BadRequestException('A custom period needs both from and to (YYYY-MM-DD)');
  }
  if (!isCalendarDay(from) || !isCalendarDay(to)) {
    throw new BadRequestException('from and to must be calendar days in YYYY-MM-DD form');
  }
  if (from > to) {
    throw new BadRequestException('from must not be after to');
  }
  if (to > today) {
    throw new BadRequestException('to must not be in the future');
  }
  if (daysInclusive(from, to) > MAX_REPORT_DAYS) {
    throw new BadRequestException(`A period can be at most ${MAX_REPORT_DAYS} days long`);
  }
  return range(from, to);
}

/**
 * Resolve the chosen period and its comparison at `now`. "Today" is the Kyiv
 * day `now` falls on, and it is included (the current day so far).
 *
 * @throws BadRequestException for a custom range that cannot be answered.
 */
export function resolveReportPeriod(input: ReportPeriodInput, now: Date): ReportPeriod {
  const preset = input.preset ?? DEFAULT_REPORT_PRESET;
  const today = kyivDateOf(now);

  switch (preset) {
    case '7d':
    case '30d':
    case '90d': {
      const current = lastKyivDays(ROLLING_DAYS[preset], now);
      return { preset, current, previous: precedingRange(current) };
    }
    case 'this-month': {
      const current = range(monthStart(today), today);
      const previousStart = monthStart(addDays(current.fromDay, -1));
      const previousEnd = addDays(previousStart, current.days - 1);
      const clippedEnd =
        previousEnd > monthEnd(previousStart) ? monthEnd(previousStart) : previousEnd;
      return { preset, current, previous: range(previousStart, clippedEnd) };
    }
    case 'last-month': {
      const lastMonthEnd = addDays(monthStart(today), -1);
      const current = range(monthStart(lastMonthEnd), lastMonthEnd);
      const monthBeforeEnd = addDays(current.fromDay, -1);
      return { preset, current, previous: range(monthStart(monthBeforeEnd), monthBeforeEnd) };
    }
    case 'custom': {
      const current = customRange(input.from, input.to, today);
      return { preset, current, previous: precedingRange(current) };
    }
  }
}
