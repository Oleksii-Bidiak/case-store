// Canonical date formatter for the storefront (TASK-809, the storefront half of
// TASK-421).
//
// Before this module the storefront had seven hand-rolled date formatters: three
// order screens with their own `Intl.DateTimeFormat` (the same order date read
// "12 черв. 2026 р." in the history and "12 червня 2026 р." on the confirmation
// page next to it), the reviews widget building a new formatter per call, the
// coupon card calling `toLocaleDateString`, and the blog and legal pages keeping
// their own month-name tables — which disagreed on March ("берез." vs "бер.")
// and read the day with `getDate()`, i.e. in whatever zone the process runs in.
// The `no-restricted-syntax` rule in `eslint.config.mjs` keeps this the only one.
//
// `timeZone: "Europe/Kyiv"`, explicitly. The API stores and returns UTC and the
// production container runs in UTC, so a zone-less formatter renders the
// server pass in UTC and the browser pass in the visitor's zone: an order placed
// at 01:30 Kyiv time on the 12th reads "11" in the HTML and "12" after
// hydration. One fixed zone gives both passes — and every visitor — one date.
//
// The output is "12 червня 2026" / "12 черв. 2026": the day, the genitive month
// name Intl produces for uk-UA, the year — without the trailing " р." Intl adds,
// which the blog and legal pages never showed. Assembled from `formatToParts`
// so the month names stay Intl's rather than a table of ours.

/** Anything a timestamp reaches the UI as: an ISO string, epoch ms, or a Date. */
export type DateInput = string | number | Date;

/** `long` → "12 червня 2026"; `short` → "12 черв. 2026". */
export type DateMonthStyle = "long" | "short";

/** Kyiv, always — see the note above. */
const TIME_ZONE = "Europe/Kyiv";

function formatter(month: DateMonthStyle, withYear: boolean) {
  return new Intl.DateTimeFormat("uk-UA", {
    timeZone: TIME_ZONE,
    day: "numeric",
    month,
    ...(withYear ? { year: "numeric" } : {}),
  });
}

// Module-scope singletons: construction is the expensive part, and these render
// inside list rows (order history, reviews).
const FORMATTERS = {
  long: formatter("long", true),
  short: formatter("short", true),
  dayMonth: formatter("long", false),
} as const;

// "14:52" — 24-hour Kyiv wall-clock time (TASK-217: «тримаємо товари до 14:52»).
const TIME_FORMATTER = new Intl.DateTimeFormat("uk-UA", {
  timeZone: TIME_ZONE,
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

/** Parse any accepted input into a valid Date, or `null` when it is unusable. */
function toDate(value: DateInput): Date | null {
  const date = value instanceof Date ? value : new Date(value);
  return Number.isFinite(date.getTime()) ? date : null;
}

/** Keep only the day, month and year parts, joined by single spaces. */
function assemble(parts: Intl.DateTimeFormatPart[]): string {
  return parts
    .filter(
      (part) =>
        part.type === "day" || part.type === "month" || part.type === "year",
    )
    .map((part) => part.value)
    .join(" ");
}

/**
 * Format a timestamp as a Kyiv calendar date: "12 червня 2026" (`long`, the
 * default) or "12 черв. 2026" (`short`).
 *
 * Returns the input unchanged (stringified) when it is not a usable date, so a
 * malformed value is visibly wrong instead of reading "Invalid Date".
 */
export function formatDate(
  value: DateInput,
  month: DateMonthStyle = "long",
): string {
  const date = toDate(value);
  return date ? assemble(FORMATTERS[month].formatToParts(date)) : String(value);
}

/**
 * Format a timestamp as a Kyiv day and month without the year: "12 червня".
 * For lines where the year is implied, such as a coupon's expiry.
 */
export function formatDayMonth(value: DateInput): string {
  const date = toDate(value);
  return date
    ? assemble(FORMATTERS.dayMonth.formatToParts(date))
    : String(value);
}

/**
 * Format a timestamp as Kyiv wall-clock time, 24-hour: "14:52". For a deadline
 * the shopper reads against their own clock — the stock reservation of an
 * unpaid order (TASK-217). Same zone rule as {@link formatDate}.
 */
export function formatTime(value: DateInput): string {
  const date = toDate(value);
  if (!date) return String(value);
  const parts = TIME_FORMATTER.formatToParts(date);
  const hour = parts.find((part) => part.type === "hour")?.value ?? "";
  const minute = parts.find((part) => part.type === "minute")?.value ?? "";
  return `${hour}:${minute}`;
}
