import type { ReportPeriodEntity } from "@/entities/analytics";
import { dict } from "@/shared/config";
import { formatCurrency, formatDayLong } from "@/shared/lib/format";

const d = dict.analytics;

// Money is `formatCurrency` from `@/shared/lib` («412 300 ₴», TASK-801) — the
// one hryvnia formatter of the panel; `formatMoney` below only puts a true
// minus in front of it.

/** U+2212 — a true minus, the width of the plus, not the hyphen «-». */
export const MINUS = "−";

const numberFormatter = new Intl.NumberFormat("uk-UA", {
  maximumFractionDigits: 1,
});

/** «12», «1,4», «1 240» — uk-UA grouping and decimal comma, sign dropped. */
export function formatMagnitude(value: number): string {
  return numberFormatter.format(Math.abs(value));
}

/** «+12», «−4», «0»: the sign the delta badges print. */
export function formatSigned(value: number): string {
  const magnitude = formatMagnitude(value);
  if (magnitude === "0") return magnitude;
  return `${value > 0 ? "+" : MINUS}${magnitude}`;
}

/**
 * Money that may be below zero — a day's net, the net of a bad period:
 * «−1 299 ₴» with a true minus. `formatCurrency` itself prints Intl's hyphen
 * («-1 299 ₴»), which in a column of figures reads as a dash.
 */
export function formatMoney(value: number): string {
  const magnitude = formatCurrency(Math.abs(value));
  return value < 0 ? `${MINUS}${magnitude}` : magnitude;
}

/** «1 240» — a count, uk-UA grouping. */
export function formatCount(value: number): string {
  return value.toLocaleString("uk-UA");
}

/** A 0…1 share as a percent: 0.142 → «14,2%»; `null` → «—». */
export function formatRate(value: number | null): string {
  return value === null ? "—" : d.deltaPercent(formatMagnitude(value * 100));
}

/**
 * A money axis tick: «30 тис.», «−10 тис.», «500». Thousands because the
 * axis is a scale, not a figure — the exact sum is in the tooltip.
 */
export function formatAxisMoney(value: number): string {
  const sign = value < 0 ? MINUS : "";
  const magnitude = Math.abs(value);
  return magnitude >= 1000
    ? `${sign}${d.thousands(formatMagnitude(magnitude / 1000))}`
    : `${sign}${formatMagnitude(magnitude)}`;
}

const yearOf = (day: string) => day.slice(0, 4);
const monthOf = (day: string) => day.slice(0, 7);

/**
 * A run of Kyiv days in words — «6 вересня — 5 жовтня 2026», «1–30 вересня
 * 2026», «5 жовтня 2026». The year is said once, at the end, unless the run
 * crosses a year (then both ends carry it). `withYear: false` drops it when it
 * is implied — the comparison range next to a period in the same year.
 */
export function formatDayRange(
  from: string,
  to: string,
  withYear = true,
): string {
  if (yearOf(from) !== yearOf(to)) {
    return `${formatDayLong(from, true)} — ${formatDayLong(to, true)}`;
  }
  if (from === to) return formatDayLong(to, withYear);
  if (monthOf(from) === monthOf(to)) {
    return `${Number(from.slice(8, 10))}–${formatDayLong(to, withYear)}`;
  }
  return `${formatDayLong(from)} — ${formatDayLong(to, withYear)}`;
}

/** «6 вересня — 5 жовтня 2026 · 30 днів» — the period bar's headline. */
export function formatPeriodLabel(period: ReportPeriodEntity): string {
  return `${formatDayRange(period.from, period.to)} · ${d.rangeDays(period.days)}`;
}

/**
 * «7 серпня — 5 вересня» — what the period is compared with. Its year is left
 * out when it is the period's own year (the headline right above says it).
 */
export function formatPreviousLabel(period: ReportPeriodEntity): string {
  return formatDayRange(
    period.previousFrom,
    period.previousTo,
    yearOf(period.previousTo) !== yearOf(period.to),
  );
}

const dayMonthDigits = (day: string) =>
  `${day.slice(8, 10)}.${day.slice(5, 7)}`;
const fullDigits = (day: string) => `${dayMonthDigits(day)}.${yearOf(day)}`;

/** «01.07–31.07.2026», «01.12.2025–31.01.2026», «05.10.2026» — compact. */
export function formatDayRangeDigits(from: string, to: string): string {
  if (from === to) return fullDigits(to);
  const head =
    yearOf(from) === yearOf(to) ? dayMonthDigits(from) : fullDigits(from);
  return `${head}–${fullDigits(to)}`;
}
