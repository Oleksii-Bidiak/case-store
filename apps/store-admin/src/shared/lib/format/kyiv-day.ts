// Kyiv calendar-day arithmetic (TASK-692).
//
// A "day" here is the `YYYY-MM-DD` string an `<input type="date">` holds and
// the API reads — a Kyiv calendar day, never an instant. Arithmetic on it is
// pure calendar arithmetic through `Date.UTC`, so no time zone (and no DST
// transition) is involved once the day itself is known.
//
// `shiftDay` and `kyivToday` used to live twice, byte for byte, in the order
// list's and the action log's filter models; the report period needs them too,
// and a widget may not import a sibling widget, so they moved here.

import { toKyivDateInput } from "./datetime-local";

const DAY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const MS_DAY = 24 * 60 * 60 * 1000;

/** `YYYY-MM-DD` ± days, in calendar arithmetic (no zone involved). */
export function shiftDay(day: string, delta: number): string {
  const [year, month, date] = day.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, date + delta))
    .toISOString()
    .slice(0, 10);
}

/** The Kyiv calendar day of `now`. */
export function kyivToday(now: number = Date.now()): string {
  return toKyivDateInput(now);
}

/**
 * Whether `value` is a real calendar day written as `YYYY-MM-DD` — the shape
 * AND the date: `2026-02-30` matches the pattern but is not a day.
 */
export function isCalendarDay(value: string): boolean {
  const match = DAY_PATTERN.exec(value);
  if (!match) return false;
  const [, year, month, date] = match.map(Number);
  const probe = new Date(Date.UTC(year, month - 1, date));
  return (
    probe.getUTCFullYear() === year &&
    probe.getUTCMonth() === month - 1 &&
    probe.getUTCDate() === date
  );
}

/** Days from `from` to `to`, both included: the same day is 1. */
export function daySpan(from: string, to: string): number {
  const [fy, fm, fd] = from.split("-").map(Number);
  const [ty, tm, td] = to.split("-").map(Number);
  return (
    Math.round((Date.UTC(ty, tm - 1, td) - Date.UTC(fy, fm - 1, fd)) / MS_DAY) +
    1
  );
}
