import { ReportPreset, type GetSalesReportParams } from "@/entities/analytics";
import { dict } from "@/shared/config";
import { daySpan, isCalendarDay, shiftDay } from "@/shared/lib/format";

const d = dict.analytics;

/**
 * The report period as the URL holds it (TASK-692): `?preset=` plus, for
 * `custom` only, `?from=` / `?to=` — Kyiv calendar days, `YYYY-MM-DD`. One
 * period drives all five reports, and living in the URL is what makes a report
 * shareable as a link (plan 188, D).
 *
 * The server resolves the preset into actual days (and the comparison range);
 * this model never computes a preset's range itself — the label the bar shows
 * comes from the server's answer, so the two cannot disagree.
 */
export interface ReportPeriodSelection {
  preset: ReportPreset;
  /** `""` unless `preset` is `custom`. */
  from: string;
  to: string;
}

/** The server's default, and therefore the one preset the URL may omit. */
export const DEFAULT_PRESET: ReportPreset = ReportPreset["30d"];

/** The API rejects a custom range longer than this (plan 188A, TASK-685). */
export const MAX_CUSTOM_DAYS = 366;

/** The presets in the order the bar draws them. */
export const PRESET_OPTIONS: ReadonlyArray<{
  id: ReportPreset;
  label: string;
}> = [
  { id: ReportPreset["7d"], label: d.preset7d },
  { id: ReportPreset["30d"], label: d.preset30d },
  { id: ReportPreset["90d"], label: d.preset90d },
  { id: ReportPreset["this-month"], label: d.presetThisMonth },
  { id: ReportPreset["last-month"], label: d.presetLastMonth },
  { id: ReportPreset.custom, label: d.presetCustom },
];

const PRESETS: readonly string[] = Object.values(ReportPreset);

const isPreset = (value: string): value is ReportPreset =>
  PRESETS.includes(value);

const DEFAULT_SELECTION: ReportPeriodSelection = {
  preset: DEFAULT_PRESET,
  from: "",
  to: "",
};

/** Why a custom range cannot be shown — `null` when it can. */
export type CustomRangeError = "missing" | "order" | "future" | "tooLong";

/**
 * Validate a custom range the way the API will (TASK-685): both ends real
 * days, `from` ≤ `to`, `to` not after Kyiv's `today`, at most
 * {@link MAX_CUSTOM_DAYS} days. A single day is a valid range.
 */
export function validateCustomRange(
  from: string,
  to: string,
  today: string,
): CustomRangeError | null {
  if (!isCalendarDay(from) || !isCalendarDay(to)) return "missing";
  if (from > to) return "order";
  if (to > today) return "future";
  if (daySpan(from, to) > MAX_CUSTOM_DAYS) return "tooLong";
  return null;
}

/**
 * Read the period off the URL. Anything the API would refuse falls back to the
 * default instead of rendering five 400s: an unknown preset, and a `custom`
 * whose range is missing, malformed or out of bounds (a hand-edited or an old
 * link — `to` that was "today" a year ago is still fine, a typo is not).
 */
export function readReportPeriod(
  params: Pick<URLSearchParams, "get">,
  today: string,
): ReportPeriodSelection {
  const preset = params.get("preset") ?? "";
  if (!isPreset(preset)) return DEFAULT_SELECTION;
  if (preset !== ReportPreset.custom) return { preset, from: "", to: "" };

  const from = params.get("from") ?? "";
  const to = params.get("to") ?? "";
  if (validateCustomRange(from, to, today)) return DEFAULT_SELECTION;
  return { preset, from, to };
}

/**
 * The `useUrlParams` patch for a period — all three keys, so switching from a
 * custom range to a preset drops the stale `from`/`to`. The default preset is
 * left out of the URL: `/analytics` and `/analytics?preset=30d` are the same
 * report, and the bare one is what the nav link opens.
 */
export function reportPeriodToUrl(
  selection: ReportPeriodSelection,
): Record<"preset" | "from" | "to", string | undefined> {
  const custom = selection.preset === ReportPreset.custom;
  return {
    preset: selection.preset === DEFAULT_PRESET ? undefined : selection.preset,
    from: custom ? selection.from : undefined,
    to: custom ? selection.to : undefined,
  };
}

/**
 * The query every report takes (all six `Get*Params` are this shape). The
 * default preset is sent explicitly, so the cache key does not depend on
 * whether the URL happened to spell it out.
 */
export type ReportQuery = GetSalesReportParams;

export function reportPeriodToQuery(
  selection: ReportPeriodSelection,
): ReportQuery {
  return selection.preset === ReportPreset.custom
    ? { preset: selection.preset, from: selection.from, to: selection.to }
    : { preset: selection.preset };
}

/**
 * The range a custom period is compared with: the same number of days right
 * before it — what the API does for `custom` (plan 188A). For the popover's
 * hint, before anything is sent.
 */
export function previousRangeOf(
  from: string,
  to: string,
): { from: string; to: string; days: number } {
  const days = daySpan(from, to);
  return { from: shiftDay(from, -days), to: shiftDay(from, -1), days };
}
