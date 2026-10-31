// Pure shaping of the device-model list for the picker (TASK-2070): the
// popular tiles, the family tabs and the series groups inside a tab.

import {
  DEVICE_FAMILIES,
  getDeviceFamily,
  type DeviceFamily,
  type DeviceModelListItemEntity,
} from "@/entities/device";

/** A model row with its family resolved once (brand + series/name). */
export type PickerModel = DeviceModelListItemEntity & {
  family: DeviceFamily | null;
};

export const POPULAR_TILE_COUNT = 8;
export const SAVED_PREVIEW_COUNT = 6;
export const SEARCH_RESULT_LIMIT = 6;

export function withFamily(
  models: readonly DeviceModelListItemEntity[],
): PickerModel[] {
  return models.map((model) => ({ ...model, family: getDeviceFamily(model) }));
}

/**
 * The first `count` models of the popularity-ordered list. Models with no
 * compatible products go last — a «0 товарів» tile is a dead end — but still
 * fill the grid when the catalogue is that thin.
 */
export function popularModels(
  models: readonly PickerModel[],
  count = POPULAR_TILE_COUNT,
): PickerModel[] {
  const stocked = models.filter((m) => m.productCount > 0);
  const empty = models.filter((m) => m.productCount <= 0);
  return [...stocked, ...empty].slice(0, count);
}

/** Families that have at least one model, in the picker's tab order. */
export function familiesPresent(
  models: readonly PickerModel[],
): DeviceFamily[] {
  const present = new Set(models.map((m) => m.family));
  return DEVICE_FAMILIES.filter((family) => present.has(family));
}

export interface SeriesGroup {
  /** Stable key; `""` for models without a series. */
  key: string;
  /** The series name, or `null` for the «no series» bucket. */
  title: string | null;
  models: PickerModel[];
}

const collator = new Intl.Collator("uk", {
  numeric: true,
  sensitivity: "base",
});

/** Newest first; within a year «Pro Max · Pro · Plus · base» (name desc). */
function byNewestThenNameDesc(a: PickerModel, b: PickerModel): number {
  const year = (b.releaseYear ?? 0) - (a.releaseYear ?? 0);
  return year !== 0 ? year : collator.compare(b.name, a.name);
}

/**
 * A family's models grouped by `series` («iPhone 16», «Galaxy S24»). Groups
 * run newest first (their newest model's year, then series name desc), models
 * inside a group likewise. Models without a series form one last group.
 */
export function groupBySeries(
  models: readonly PickerModel[],
  family: DeviceFamily,
): SeriesGroup[] {
  const groups = new Map<string, SeriesGroup>();
  for (const model of models) {
    if (model.family !== family) continue;
    const key = model.series?.trim() ?? "";
    let group = groups.get(key);
    if (!group) {
      group = { key, title: key || null, models: [] };
      groups.set(key, group);
    }
    group.models.push(model);
  }
  const list = [...groups.values()];
  for (const group of list) group.models.sort(byNewestThenNameDesc);
  const newest = (g: SeriesGroup) => g.models[0]?.releaseYear ?? 0;
  return list.sort((a, b) => {
    if (!a.title !== !b.title) return a.title ? -1 : 1;
    const year = newest(b) - newest(a);
    return year !== 0 ? year : collator.compare(b.key, a.key);
  });
}
