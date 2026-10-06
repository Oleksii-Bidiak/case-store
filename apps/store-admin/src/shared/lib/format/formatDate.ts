// Canonical date/time formatters for the admin panel (TASK-421).
//
// Before this module every widget declared its own `Intl.DateTimeFormat`
// singleton — 18 of them, and they disagreed: eight rendered US English
// ("Sep 9, 2026, 6:40 PM"), six rendered Ukrainian, and four called
// `toLocaleDateString()` / `toLocaleString()` with no locale at all, so the
// output depended on whatever locale the operator's browser happened to be in.
// This module is the single source of truth now; the `no-restricted-syntax` rule
// in `eslint.config.mjs` keeps it that way.
//
// TWO DECISIONS ARE NON-NEGOTIABLE HERE.
//
// 1. `timeZone: "Europe/Kyiv"`, explicitly. The API stores and returns UTC and
//    the production container runs in UTC. Without an explicit zone, Intl uses
//    the *runtime's* zone — which on a server-rendered pass is UTC. The operator
//    would then read "15:40" for an order placed at 18:40 Kyiv time, with
//    nothing on screen saying it is UTC. Being two or three hours off while
//    looking perfectly correct is worse than being visibly wrong.
//
// 2. `hour12: false`. Ukrainian has no AM/PM convention; "6:40 PM" is not
//    something an operator here reads at a glance.
//
// Output (uk-UA convention):
//   formatDate      → "09.09.2026"
//   formatDateTime  → "09.09.2026, 18:40"
//   formatTime      → "18:40"
//   formatRelative  → "5 хвилин тому", "учора", "минулого місяця"
//
// Mirrors `formatCurrency.ts`: module-scope Intl singletons (construction is the
// expensive part, and these render inside table rows) plus a defensive fallback
// that stringifies unusable input rather than printing "Invalid Date".

/** Anything a timestamp reaches the UI as: an ISO string, epoch ms, or a Date. */
export type DateInput = string | number | Date;

/** Kyiv, always — see the note above. */
const TIME_ZONE = "Europe/Kyiv";

const dateFormatter = new Intl.DateTimeFormat("uk-UA", {
  timeZone: TIME_ZONE,
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
});

const dateTimeFormatter = new Intl.DateTimeFormat("uk-UA", {
  timeZone: TIME_ZONE,
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

const timeFormatter = new Intl.DateTimeFormat("uk-UA", {
  timeZone: TIME_ZONE,
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

// `numeric: "auto"` is what buys the idiomatic forms — "учора" instead of
// "1 день тому", "минулого місяця" instead of "1 місяць тому".
const relativeFormatter = new Intl.RelativeTimeFormat("uk-UA", {
  numeric: "auto",
});

const MS_SECOND = 1000;
const MS_MINUTE = 60 * MS_SECOND;
const MS_HOUR = 60 * MS_MINUTE;
const MS_DAY = 24 * MS_HOUR;

/**
 * Largest-unit-first thresholds for `formatRelative`. Month and year use the
 * usual calendar approximations (30 / 365 days) — at that distance the phrase is
 * "3 місяці тому" and nobody is counting.
 */
const RELATIVE_UNITS: ReadonlyArray<[Intl.RelativeTimeFormatUnit, number]> = [
  ["year", 365 * MS_DAY],
  ["month", 30 * MS_DAY],
  ["day", MS_DAY],
  ["hour", MS_HOUR],
  ["minute", MS_MINUTE],
  ["second", MS_SECOND],
];

/** Parse any accepted input into a valid Date, or `null` when it is unusable. */
function toDate(value: DateInput): Date | null {
  const date = value instanceof Date ? value : new Date(value);
  return Number.isFinite(date.getTime()) ? date : null;
}

/**
 * Format a timestamp as a Kyiv calendar date: "09.09.2026".
 * Returns the input unchanged (stringified) when it is not a usable date.
 */
export function formatDate(value: DateInput): string {
  const date = toDate(value);
  return date ? dateFormatter.format(date) : String(value);
}

/**
 * Format a timestamp as a Kyiv date plus 24-hour time: "09.09.2026, 18:40".
 * Returns the input unchanged (stringified) when it is not a usable date.
 */
export function formatDateTime(value: DateInput): string {
  const date = toDate(value);
  return date ? dateTimeFormatter.format(date) : String(value);
}

/**
 * Format a timestamp as a Kyiv 24-hour clock time only: "18:40".
 *
 * For the two places where context already establishes the date — the
 * dashboard's "updated at" line and the order detail's restocked-at badge — and
 * repeating it would be noise.
 */
export function formatTime(value: DateInput): string {
  const date = toDate(value);
  return date ? timeFormatter.format(date) : String(value);
}

/**
 * Format a timestamp relative to now, in Ukrainian: "5 хвилин тому", "учора",
 * "минулого місяця", "через 3 години".
 *
 * Ukrainian plural forms (хвилина / хвилини / хвилин) are Intl's job, not ours —
 * hand-rolling them is exactly how "5 хвилини тому" reaches production.
 *
 * @param now Reference point; defaults to the current time. Injectable so tests
 *   are not clock-dependent.
 */
export function formatRelative(
  value: DateInput,
  now: DateInput = Date.now(),
): string {
  const date = toDate(value);
  const reference = toDate(now);
  if (!date || !reference) {
    return String(value);
  }

  const diffMs = date.getTime() - reference.getTime();
  for (const [unit, unitMs] of RELATIVE_UNITS) {
    if (Math.abs(diffMs) >= unitMs) {
      return relativeFormatter.format(Math.trunc(diffMs / unitMs), unit);
    }
  }

  // Under a second apart — "зараз".
  return relativeFormatter.format(0, "second");
}

// TASK-692: a calendar DAY in words — «6 вересня», «6 вересня 2026». Built from
// `formatToParts`, because uk-UA's own long date appends « р.» after the year,
// which the report period's «6 вересня — 5 жовтня 2026» does not say.
const dayLongFormatter = new Intl.DateTimeFormat("uk-UA", {
  timeZone: TIME_ZONE,
  day: "numeric",
  month: "long",
  year: "numeric",
});

/**
 * Format a Kyiv calendar day (`YYYY-MM-DD`, what the report API returns) in
 * words: "6 вересня" or, with `withYear`, "6 вересня 2026".
 *
 * The day is pinned at 12:00 UTC before formatting in Kyiv, which is the same
 * calendar day whatever the offset (UTC+2 / +3), so no instant can slip across
 * midnight. Returns the input unchanged when it is not a `YYYY-MM-DD` day.
 */
export function formatDayLong(day: string, withYear = false): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day);
  if (!match) return day;
  const noon = new Date(
    Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 12),
  );
  const parts = dayLongFormatter.formatToParts(noon);
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((entry) => entry.type === type)?.value ?? "";
  const dayMonth = `${part("day")} ${part("month")}`;
  return withYear ? `${dayMonth} ${part("year")}` : dayMonth;
}
