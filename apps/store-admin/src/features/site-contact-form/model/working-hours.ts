/**
 * Structured working-hours model for the site-contact settings form (TASK-221).
 *
 * The API contract is untouched: `SiteContactSettings.workingHours` stays a
 * plain string. This module converts between that string and a structured
 * 7-day model so the admin can edit hours per day while the storefront keeps
 * rendering the stored string as-is.
 *
 * Canonical serialized format (uses en dashes, `; ` separators, hours without
 * a leading zero):
 *
 *   `Пн–Пт: 9:00–18:00; Сб: 10:00–16:00; Нд: вихідний`
 *
 * `parseWorkingHours` accepts the canonical format plus reasonable variants
 * (hyphen / en / em dash, `,` or `;` separators, spaces around the time dash,
 * zero-padded hours, case-insensitive day names and «Вихідний»). Anything it
 * cannot fully account for — free text, partial day coverage, duplicate days —
 * returns `null`, which the form treats as legacy raw text.
 */

/** Open interval for one day. Times are zero-padded `HH:MM` (as emitted by
 *  `<input type="time">`); they may be `""` transiently while editing. */
export interface DayHours {
  open: string;
  close: string;
}

/** One day's schedule: hours, or `null` = вихідний. */
export type DaySchedule = DayHours | null;

/** Exactly 7 entries, index 0 = Понеділок … index 6 = Неділя. */
export type WorkingHoursModel = DaySchedule[];

export const DAY_LABELS_SHORT = [
  "Пн",
  "Вт",
  "Ср",
  "Чт",
  "Пт",
  "Сб",
  "Нд",
] as const;

export const DAY_LABELS_FULL = [
  "Понеділок",
  "Вівторок",
  "Середа",
  "Четвер",
  "Пʼятниця",
  "Субота",
  "Неділя",
] as const;

const CLOSED_LABEL = "вихідний";
const CLOSED_RE = /^вихідн(?:ий|і)$/i;

/** Sensible starting point when no parseable schedule exists yet. */
export const DEFAULT_WORKING_HOURS_MODEL: WorkingHoursModel = [
  { open: "09:00", close: "18:00" },
  { open: "09:00", close: "18:00" },
  { open: "09:00", close: "18:00" },
  { open: "09:00", close: "18:00" },
  { open: "09:00", close: "18:00" },
  null,
  null,
];

/** Per-day validation issue for the editor. */
export type DayIssue = "missing" | "order";

/** `"missing"` — a time field is empty; `"order"` — close ≤ open; `null` — ok. */
export function getDayIssue(day: DaySchedule): DayIssue | null {
  if (day === null) return null;
  if (!day.open || !day.close) return "missing";
  // Zero-padded HH:MM compares correctly as a string.
  if (day.close <= day.open) return "order";
  return null;
}

/** True when every day is either вихідний or has a valid open<close interval. */
export function isModelValid(model: WorkingHoursModel): boolean {
  return model.every((day) => getDayIssue(day) === null);
}

/** True when all 7 days are marked вихідний (allowed, but worth a warning). */
export function isAllClosed(model: WorkingHoursModel): boolean {
  return model.every((day) => day === null);
}

/** `"09:05"` → `"9:05"` for the human-facing canonical string. */
function displayTime(time: string): string {
  return time.replace(/^0(\d)/, "$1");
}

/**
 * Serialize a model into the canonical UA string, grouping consecutive days
 * with identical hours. Assumes a valid model (see {@link isModelValid});
 * call sites must not serialize models with empty time fields.
 */
export function serializeWorkingHours(model: WorkingHoursModel): string {
  const keyOf = (day: DaySchedule) =>
    day === null ? CLOSED_LABEL : `${day.open}|${day.close}`;

  const segments: string[] = [];
  let start = 0;
  while (start < model.length) {
    let end = start;
    while (
      end + 1 < model.length &&
      keyOf(model[end + 1]) === keyOf(model[start])
    ) {
      end += 1;
    }
    const label =
      start === end
        ? DAY_LABELS_SHORT[start]
        : `${DAY_LABELS_SHORT[start]}–${DAY_LABELS_SHORT[end]}`;
    const day = model[start];
    const hours =
      day === null
        ? CLOSED_LABEL
        : `${displayTime(day.open)}–${displayTime(day.close)}`;
    segments.push(`${label}: ${hours}`);
    start = end + 1;
  }
  return segments.join("; ");
}

const DAY_INDEX: Record<string, number> = Object.fromEntries(
  DAY_LABELS_SHORT.map((label, index) => [label.toLowerCase(), index]),
);

/** Any of hyphen, en dash, em dash. */
const DASH = "[-–—]";

const SEGMENT_RE = new RegExp(
  `^([а-яіїє]{2})(?:\\s*${DASH}\\s*([а-яіїє]{2}))?\\s*:\\s*(.+)$`,
  "iu",
);

const TIME_RANGE_RE = new RegExp(
  `^(\\d{1,2}):(\\d{2})\\s*${DASH}\\s*(\\d{1,2}):(\\d{2})$`,
);

function parseTimeRange(text: string): DayHours | null {
  const match = TIME_RANGE_RE.exec(text);
  if (!match) return null;
  const [, openH, openM, closeH, closeM] = match;
  const nums = [openH, openM, closeH, closeM].map(Number);
  if (nums[0] > 23 || nums[2] > 23 || nums[1] > 59 || nums[3] > 59) {
    return null;
  }
  const pad = (h: string) => h.padStart(2, "0");
  return {
    open: `${pad(openH)}:${openM}`,
    close: `${pad(closeH)}:${closeM}`,
  };
}

/**
 * Parse a working-hours string into the structured model.
 *
 * Returns `null` for anything that is not a complete, unambiguous schedule:
 * free text, unknown day names, wrapped ranges (`Сб–Пн`), days covered twice,
 * days not covered at all, or malformed times.
 */
export function parseWorkingHours(input: string): WorkingHoursModel | null {
  const trimmed = input.trim();
  if (!trimmed) return null;

  const model: (DaySchedule | undefined)[] = new Array<DaySchedule | undefined>(
    7,
  ).fill(undefined);

  for (const rawSegment of trimmed.split(/[;,]/)) {
    const segment = rawSegment.trim();
    if (!segment) return null;

    const match = SEGMENT_RE.exec(segment);
    if (!match) return null;

    const [, fromLabel, toLabel, hoursText] = match;
    const from = DAY_INDEX[fromLabel.toLowerCase()];
    const to = toLabel === undefined ? from : DAY_INDEX[toLabel.toLowerCase()];
    if (from === undefined || to === undefined || from > to) return null;

    const hours = hoursText.trim();
    let schedule: DaySchedule;
    if (CLOSED_RE.test(hours)) {
      schedule = null;
    } else {
      const range = parseTimeRange(hours);
      if (!range) return null;
      schedule = range;
    }

    for (let day = from; day <= to; day += 1) {
      if (model[day] !== undefined) return null; // day covered twice
      model[day] =
        schedule === null
          ? null
          : { open: schedule.open, close: schedule.close };
    }
  }

  if (model.some((day) => day === undefined)) return null; // gaps in coverage
  return model as WorkingHoursModel;
}
