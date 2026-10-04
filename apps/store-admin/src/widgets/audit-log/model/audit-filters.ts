import { type GetAuditLogParams } from "@/entities/audit";
import { dict } from "@/shared/config";
import {
  fromKyivDateEnd,
  fromKyivDateStart,
  toKyivDateInput,
} from "@/shared/lib";

const d = dict.auditLog;

/**
 * The log's sheet filters as they sit in the URL — `""` means "any". The
 * search (`?action=`) lives in the toolbar, not here.
 *
 * `from`/`to` are Kyiv calendar days (`YYYY-MM-DD`) in the URL, because that
 * is what a person pastes and reads; the API takes instants, so they are
 * resolved to the first and last millisecond of those days on the way out.
 */
export interface AuditFilters {
  actorId: string;
  actorRole: string;
  entityType: string;
  from: string;
  to: string;
}

export const EMPTY_AUDIT_FILTERS: AuditFilters = {
  actorId: "",
  actorRole: "",
  entityType: "",
  from: "",
  to: "",
};

export function readAuditFilters(params: URLSearchParams): AuditFilters {
  return {
    actorId: params.get("actorId") ?? "",
    actorRole: params.get("actorRole") ?? "",
    entityType: params.get("entityType") ?? "",
    from: params.get("from") ?? "",
    to: params.get("to") ?? "",
  };
}

/** What applying the sheet writes to the URL (`undefined` drops a param). */
export function auditFiltersToUrl(
  filters: AuditFilters,
): Record<string, string | undefined> {
  return {
    actorId: filters.actorId || undefined,
    actorRole: filters.actorRole || undefined,
    entityType: filters.entityType || undefined,
    from: filters.from || undefined,
    to: filters.to || undefined,
  };
}

/** The API's query for these filters and the toolbar's action search. */
export function auditFiltersToQuery(
  filters: AuditFilters,
  action: string,
): GetAuditLogParams {
  return {
    action: action || undefined,
    entityType: filters.entityType || undefined,
    actorId: filters.actorId || undefined,
    // Cast: the generated type is the API's `UserRole` union and this value
    // comes from the URL. An unknown role is refused by the DTO with a 400
    // rather than silently widening the result — the honest outcome for a
    // hand-edited link.
    actorRole: (filters.actorRole || undefined) as
      GetAuditLogParams["actorRole"] | undefined,
    from: fromKyivDateStart(filters.from)?.toISOString(),
    to: fromKyivDateEnd(filters.to)?.toISOString(),
  };
}

/* ── Period ─────────────────────────────────────────────────────────────── */

export const PERIOD_PRESETS: ReadonlyArray<{ id: string; label: string }> = [
  { id: "today", label: d.periodToday },
  { id: "7d", label: d.period7Days },
  { id: "30d", label: d.period30Days },
  { id: "custom", label: d.periodCustom },
];

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

/** The range a preset stands for, counted from Kyiv's `today`. */
export function periodRange(
  preset: string,
  today: string,
): { from: string; to: string } | null {
  switch (preset) {
    case "today":
      return { from: today, to: today };
    case "7d":
      return { from: shiftDay(today, -6), to: today };
    case "30d":
      return { from: shiftDay(today, -29), to: today };
    default:
      return null;
  }
}

/** Which preset a range is — `custom` for any other range, `""` for none. */
export function presetOf(from: string, to: string, today: string): string {
  if (!from && !to) return "";
  for (const { id } of PERIOD_PRESETS) {
    const range = periodRange(id, today);
    if (range && range.from === from && range.to === to) return id;
  }
  return "custom";
}

const dayMonth = (day: string) => `${day.slice(8, 10)}.${day.slice(5, 7)}`;
const fullDay = (day: string) => `${dayMonth(day)}.${day.slice(0, 4)}`;

/** «23.09 – 25.09.2026», «з 23.09.2026», «до 25.09.2026». */
export function periodLabel(from: string, to: string): string {
  if (from && to) {
    if (from === to) return fullDay(from);
    const sameYear = from.slice(0, 4) === to.slice(0, 4);
    return `${sameYear ? dayMonth(from) : fullDay(from)} – ${fullDay(to)}`;
  }
  if (from) return d.periodSince(fullDay(from));
  return d.periodUntil(fullDay(to));
}

/* ── Day groups ─────────────────────────────────────────────────────────── */

/**
 * «Сьогодні, 25.09.2026» · «Вчора, 24.09.2026» · «23.09.2026» (Ж1) — the Kyiv
 * day of an entry, counted from `now` (the time the page was fetched).
 */
export function dayGroup(
  createdAt: string,
  now: number,
): { key: string; label: string } {
  const key = toKyivDateInput(createdAt);
  const today = toKyivDateInput(now);
  const date = fullDay(key);
  if (key === today) return { key, label: d.dayToday(date) };
  if (key === shiftDay(today, -1)) return { key, label: d.dayYesterday(date) };
  return { key, label: date };
}
