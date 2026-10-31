/**
 * Pure helpers behind the device series picker (TASK-1955): grouping models into
 * brand → series, the short chip label, the tri-state of a series, the summary
 * line and the «one model missing» reminder. No React, no fetching — unit-tested
 * in `series.test.ts`.
 */

/** The fields of a device model the picker reads. Extra fields are ignored. */
export interface PickerModel {
  id: string;
  name: string;
  deviceBrandId: string;
  series?: string | null;
  releaseYear?: number | null;
  /** Publicly visible products compatible with the model (the public list's count). */
  productCount?: number;
}

export interface PickerBrand {
  id: string;
  name: string;
}

export interface SeriesGroup {
  /** Stable React / DOM key: `${brandId}:${series}` or `${brandId}:` for «Інші». */
  key: string;
  brandId: string;
  /** The series name, or null for the models that have none. */
  series: string | null;
  models: PickerModel[];
}

export interface BrandGroup {
  brandId: string;
  brandName: string;
  series: SeriesGroup[];
}

export type SeriesStateKind = "all" | "some" | "none";

export interface SeriesState {
  selected: number;
  total: number;
  state: SeriesStateKind;
}

const collator = new Intl.Collator("uk", {
  numeric: true,
  sensitivity: "base",
});

function maxYear(models: readonly PickerModel[]): number {
  return models.reduce(
    (max, model) => Math.max(max, model.releaseYear ?? -Infinity),
    -Infinity,
  );
}

/**
 * Models grouped by brand (the brands' own order) and, inside a brand, by series.
 *
 * Series order: newest first by the largest `releaseYear` in it, then by name — the
 * mockup reads iPhone 16 → 15 → 14. Models inside a series keep the API order
 * («16 Pro Max · 16 Pro · 16 Plus · 16»). Models without a series go last, in one
 * group per brand. Brands with no models are left out.
 */
export function groupBySeries(
  models: readonly PickerModel[],
  brands: readonly PickerBrand[],
): BrandGroup[] {
  const byBrand = new Map<string, Map<string | null, PickerModel[]>>();
  for (const model of models) {
    const series = model.series?.trim() || null;
    const bucket = byBrand.get(model.deviceBrandId) ?? new Map();
    const list = bucket.get(series) ?? [];
    list.push(model);
    bucket.set(series, list);
    byBrand.set(model.deviceBrandId, bucket);
  }

  // Brands the brand list does not know (should not happen) still show, last.
  const known = brands.filter((brand) => byBrand.has(brand.id));
  const unknown = [...byBrand.keys()]
    .filter((id) => !brands.some((brand) => brand.id === id))
    .map((id) => ({ id, name: "" }));

  return [...known, ...unknown].map((brand) => {
    const bucket =
      byBrand.get(brand.id) ?? new Map<string | null, PickerModel[]>();
    const named: SeriesGroup[] = [];
    let unnamed: SeriesGroup | null = null;
    for (const [series, list] of bucket) {
      const group = {
        key: `${brand.id}:${series ?? ""}`,
        brandId: brand.id,
        series,
        models: list,
      };
      if (series === null) unnamed = group;
      else named.push(group);
    }
    named.sort(
      (a, b) =>
        maxYear(b.models) - maxYear(a.models) ||
        collator.compare(a.series ?? "", b.series ?? ""),
    );
    return {
      brandId: brand.id,
      brandName: brand.name,
      series: unnamed ? [...named, unnamed] : named,
    };
  });
}

/**
 * The chip label: the model name without its series prefix. The prefix is the
 * series minus its last word when that word holds a digit («iPhone 15» → «iPhone »,
 * so «iPhone 15 Pro Max» → «15 Pro Max»), else the whole series plus a space
 * («Apple Watch» → «Series 10 46 мм»). Falls back to the full name.
 */
export function shortModelName(
  model: Pick<PickerModel, "name" | "series">,
): string {
  const series = model.series?.trim();
  if (!series) return model.name;
  const words = series.split(/\s+/);
  const last = words[words.length - 1] ?? "";
  const prefix =
    /\d/.test(last) && words.length > 1
      ? `${words.slice(0, -1).join(" ")} `
      : `${series} `;
  if (model.name.startsWith(prefix) && model.name.length > prefix.length) {
    return model.name.slice(prefix.length);
  }
  return model.name;
}

export function seriesState(
  group: Pick<SeriesGroup, "models">,
  value: ReadonlySet<string>,
): SeriesState {
  const total = group.models.length;
  const selected = group.models.filter((model) => value.has(model.id)).length;
  const state: SeriesStateKind =
    selected === 0 ? "none" : selected === total ? "all" : "some";
  return { selected, total, state };
}

/** Series checkbox click: all → none; none or some → all. */
export function toggleSeries(
  group: Pick<SeriesGroup, "models">,
  value: ReadonlySet<string>,
): Set<string> {
  const next = new Set(value);
  const { state } = seriesState(group, value);
  for (const model of group.models) {
    if (state === "all") next.delete(model.id);
    else next.add(model.id);
  }
  return next;
}

export interface SummaryPart {
  key: string;
  /** null = the models-without-series group. */
  series: string | null;
  whole: boolean;
  total: number;
  /** Full name of the first selected model, short names of the rest. */
  names: string[];
}

/** One part per series with a selection, in display order. */
export function summarize(
  groups: readonly BrandGroup[],
  value: ReadonlySet<string>,
): SummaryPart[] {
  const parts: SummaryPart[] = [];
  for (const brand of groups) {
    for (const group of brand.series) {
      const picked = group.models.filter((model) => value.has(model.id));
      if (picked.length === 0) continue;
      parts.push({
        key: group.key,
        series: group.series,
        whole: picked.length === group.models.length && group.series !== null,
        total: group.models.length,
        names: picked.map((model, index) =>
          index === 0 || group.series === null
            ? model.name
            : shortModelName(model),
        ),
      });
    }
  }
  return parts;
}

export interface PartialSeriesReminder {
  key: string;
  series: string;
  missingModelName: string;
  selected: number;
  total: number;
}

/**
 * Series with exactly ONE model left unticked out of three or more — most likely a
 * missed tick, possibly a real size difference. A hint, never an error.
 */
export function partialSeriesReminders(
  groups: readonly BrandGroup[],
  value: ReadonlySet<string>,
): PartialSeriesReminder[] {
  const reminders: PartialSeriesReminder[] = [];
  for (const brand of groups) {
    for (const group of brand.series) {
      if (group.series === null || group.models.length < 3) continue;
      const missing = group.models.filter((model) => !value.has(model.id));
      if (missing.length !== 1) continue;
      reminders.push({
        key: group.key,
        series: group.series,
        missingModelName: missing[0].name,
        selected: group.models.length - 1,
        total: group.models.length,
      });
    }
  }
  return reminders;
}

/** Does the model (or its series) match the search needle? */
export function matchesSearch(model: PickerModel, needle: string): boolean {
  if (!needle) return true;
  return (
    model.name.toLocaleLowerCase("uk-UA").includes(needle) ||
    (model.series ?? "").toLocaleLowerCase("uk-UA").includes(needle)
  );
}

/** The search box value as the matcher wants it. */
export function toNeedle(search: string): string {
  return search.trim().toLocaleLowerCase("uk-UA");
}

/**
 * The selection as a bulk request names it: a fully ticked series is sent by NAME
 * — «весь iPhone 15» — and the API expands it to every model of the series,
 * including ones hidden from this (active-only) list; every other ticked model is
 * sent by id. A series name shared by two brands is never sent by name, since the
 * API would expand it across both.
 */
export function toBulkSelection(
  groups: readonly BrandGroup[],
  value: ReadonlySet<string>,
): { series: string[]; deviceModelIds: string[] } {
  const brandsBySeries = new Map<string, number>();
  for (const brand of groups) {
    for (const group of brand.series) {
      if (group.series === null) continue;
      brandsBySeries.set(
        group.series,
        (brandsBySeries.get(group.series) ?? 0) + 1,
      );
    }
  }
  const series: string[] = [];
  const deviceModelIds: string[] = [];
  for (const brand of groups) {
    for (const group of brand.series) {
      const { state } = seriesState(group, value);
      if (state === "none") continue;
      if (
        state === "all" &&
        group.series !== null &&
        brandsBySeries.get(group.series) === 1
      ) {
        series.push(group.series);
        continue;
      }
      for (const model of group.models) {
        if (value.has(model.id)) deviceModelIds.push(model.id);
      }
    }
  }
  return { series, deviceModelIds };
}
