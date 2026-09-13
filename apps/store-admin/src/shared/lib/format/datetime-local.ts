// Kyiv-pinned conversion for `<input type="datetime-local">` values (TASK-421
// tail, TASK-429).
//
// `formatDate.ts` next door pinned every RENDERED date to Europe/Kyiv and the
// `no-restricted-syntax` guard in `eslint.config.mjs` keeps it that way. The
// INPUTS were missed, and the guard's selectors cannot see them: a
// `datetime-local` value is built and parsed with plain `Date` arithmetic, not
// with `Intl` or `toLocale*String`, so nothing flagged the four hand-rolled
// `toDateTimeLocal` helpers that lived in the edit-view widgets nor the
// `new Date("YYYY-MM-DDTHH:mm").toISOString()` calls in the four form schemas.
// Both ends used the BROWSER's zone.
//
// WHY THAT MATTERS EVEN THOUGH THE ROUND TRIP LOOKED CORRECT.
//
// Browser-zone in, browser-zone out is self-consistent: open a banner, save it
// untouched, and the same instant comes back. Nothing crashes, nothing is
// visibly wrong, and that is exactly why this survived review twice. What breaks
// is the pair of screens an operator reads TOGETHER. On a laptop in CET a banner
// scheduled for 2026-10-01T21:00Z renders as «Заплановано на 02.10» in the LIST
// (Kyiv, UTC+3 — `formatDate`) and as `2026-10-01T23:00` in the FORM (CET). The
// operator who trusts the list and types «02.10 00:00» writes 2026-10-01T22:00Z
// — two hours early — and the promo goes live a day before the list says it
// will. The store runs on Kyiv time; the admin panel must not quietly ask the
// operator which zone they meant.
//
// WHY THE OFFSET IS RESOLVED PER INSTANT AND NOT HARD-CODED.
//
// Ukraine observes DST: UTC+2 in winter, UTC+3 in summer. `value + ":00+03:00"`
// is the tempting one-liner and it is the bug one rung down — every winter
// schedule lands an hour off, which is worse than the bug it replaces because it
// is seasonal and therefore reproduces only half the year. `kyivOffsetMs` asks
// ICU what Kyiv's offset actually was at that instant.

import type { DateInput } from "./formatDate";

/** Kyiv, always — same decision, same reasons as `formatDate.ts`. */
const TIME_ZONE = "Europe/Kyiv";

/**
 * `sv-SE` is chosen for its OUTPUT, not for Swedish: it is the one widely
 * available locale whose numeric date/time pattern is already ISO-ordered
 * (`2026-09-09 18:40`), zero-padded, and 24-hour. Every other candidate needs
 * the fields re-assembled by hand anyway.
 *
 * `hourCycle: "h23"` rather than `hour12: false`: some ICU builds render
 * midnight as `24:00` under `hour12: false` (the h24 cycle), and `24:00` is not
 * a value any `datetime-local` input will accept — the field would silently
 * render empty for every schedule set at midnight, which is the single most
 * common time an operator picks.
 */
const kyivFormatter = new Intl.DateTimeFormat("sv-SE", {
  timeZone: TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

/** The only shape `<input type="datetime-local">` emits and accepts. */
const DATE_TIME_LOCAL = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})/;

type KyivField = "year" | "month" | "day" | "hour" | "minute";
type KyivParts = Record<KyivField, string>;

/**
 * The Kyiv wall-clock fields of an instant, as the zero-padded strings ICU
 * produced.
 *
 * Deliberately built from `formatToParts` rather than by string-splitting
 * `format()`: the LITERAL between the date and the time is ICU data, not a
 * contract. ICU has shipped NBSP and narrow-NBSP separators inside date/time
 * patterns before — `formatDate.test.ts` normalises exactly that — and a
 * `value.replace(" ", "T")` would have produced `2026-09-09 18:40` on such a
 * build, which the input rejects wholesale. Reading the parts skips the
 * question, and the same function then serves the offset lookup below, so there
 * is one code path instead of two.
 */
function kyivParts(date: Date): KyivParts {
  const parts: Partial<KyivParts> = {};
  for (const part of kyivFormatter.formatToParts(date)) {
    if (part.type !== "literal") {
      parts[part.type as KyivField] = part.value;
    }
  }
  return parts as KyivParts;
}

/** Parse any accepted input into a valid Date, or `null` when unusable. */
function toDate(value: DateInput): Date | null {
  const date = value instanceof Date ? value : new Date(value);
  return Number.isFinite(date.getTime()) ? date : null;
}

/**
 * Kyiv's UTC offset in milliseconds at a given instant (positive east of UTC:
 * +2h in winter, +3h in summer).
 *
 * Derived by asking ICU for the Kyiv wall clock at that instant and reading
 * those fields back as if they were UTC — the gap between the two IS the offset.
 * That is the only way to get it without shipping a tz database: `Date` exposes
 * the runtime's zone and UTC, never a third one.
 *
 * Assumes a MINUTE-ALIGNED instant, because the formatter has no seconds field
 * and would otherwise fold the dropped seconds into the answer. Every caller
 * below builds its instant from `Date.UTC(..., hour, minute)`, so that holds.
 */
function kyivOffsetMs(instantMs: number): number {
  const parts = kyivParts(new Date(instantMs));
  const wallClockAsUtc = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour),
    Number(parts.minute),
  );
  return wallClockAsUtc - instantMs;
}

/**
 * Render an instant as the `YYYY-MM-DDTHH:mm` value of a `datetime-local` input,
 * in KYIV time — so the form shows the same wall clock the list already shows
 * through `formatDate` / `formatDateTime`.
 *
 * Returns `""` for anything unusable (null, `""`, a malformed string), which is
 * what the inputs want: the empty string is how a `datetime-local` field says
 * "unset", and it is what the form schemas treat as "no date".
 */
export function toKyivDateTimeLocal(value: DateInput): string {
  const date = toDate(value);
  if (!date) {
    return "";
  }
  const parts = kyivParts(date);
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`;
}

/**
 * Read a `datetime-local` value back as the instant it denotes in KYIV time —
 * the inverse of {@link toKyivDateTimeLocal}, and what the form schemas send to
 * the API after `.toISOString()`.
 *
 * Returns `null` when the value is empty or not a real calendar moment, so a
 * caller cannot walk into `new Date("…").toISOString()` throwing a RangeError on
 * input it merely truthiness-checked.
 *
 * Resolved in two passes. The first converts the typed wall clock using the
 * offset that applies at the naive instant; the second re-reads the offset at
 * the candidate answer. The two differ only within a few hours of a DST switch,
 * which is precisely when a one-pass conversion is off by an hour.
 *
 * The two irreducible DST cases resolve as follows, and both are deliberate:
 *   - a time that does not exist (Kyiv jumps 03:00 → 04:00 in spring) is pushed
 *     forward into the hour that does — the operator's intent, "as soon as that
 *     morning starts", is preserved;
 *   - a time that happens twice (Kyiv repeats 03:00–04:00 in autumn) resolves to
 *     the SECOND, standard-time occurrence. Either choice is arbitrary; the
 *     point is that it is stable and round-trips.
 */
export function fromKyivDateTimeLocal(value: string): Date | null {
  if (!value) {
    return null;
  }
  const match = DATE_TIME_LOCAL.exec(value.trim());
  if (!match) {
    return null;
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const hour = Number(match[4]);
  const minute = Number(match[5]);

  // The typed wall clock, read as if it were UTC. Not the answer — the seed.
  const wallClockAsUtc = Date.UTC(year, month - 1, day, hour, minute);

  // `Date.UTC` silently ROLLS OVER out-of-range fields: "2026-02-30T10:00"
  // becomes 2 March and "…T25:00" becomes the next day. The regex cannot catch
  // that (both are four digits and two digits), so reject anything the seed did
  // not preserve verbatim. A real browser input never produces such a value, but
  // this function is also fed saved form state and hand-written test fixtures.
  const probe = new Date(wallClockAsUtc);
  if (
    probe.getUTCFullYear() !== year ||
    probe.getUTCMonth() !== month - 1 ||
    probe.getUTCDate() !== day ||
    probe.getUTCHours() !== hour ||
    probe.getUTCMinutes() !== minute
  ) {
    return null;
  }

  const firstPass = wallClockAsUtc - kyivOffsetMs(wallClockAsUtc);
  return new Date(wallClockAsUtc - kyivOffsetMs(firstPass));
}
