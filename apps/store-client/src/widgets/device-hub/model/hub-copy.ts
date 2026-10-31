// Pure helpers behind the model hub's copy (TASK-1954). No React, no I/O.

import type { DeviceHubEntity } from "@/shared/api/generated/models";
import { dict } from "@/shared/config";

/** Cards per section rail — the mockup's five at catalogue size (API sends ≤ 8). */
export const HUB_RAIL_SIZE = 5;

/** How many category names the lede and the meta description spell out. */
export const LEDE_CATEGORY_COUNT = 3;

/**
 * Lower-case the first letter of a category name for use mid-sentence —
 * «Захисне скло» → «захисне скло» — but leave an acronym or a brand alone:
 * «MagSafe-аксесуари» and «USB-кабелі» keep their capitals.
 */
export function lowerFirst(text: string): string {
  if (!text) return text;
  // A capital anywhere after the first letter of the first word marks a name.
  const firstWord = text.split(/[\s-]/, 1)[0];
  if (/\p{Lu}/u.test(firstWord.slice(1))) return text;
  return text[0].toLocaleLowerCase("uk-UA") + text.slice(1);
}

/** The first category names, lower-cased for running text, and whether more follow. */
export function ledeCategories(groups: DeviceHubEntity["groups"]): {
  names: string[];
  hasMore: boolean;
} {
  return {
    names: groups
      .slice(0, LEDE_CATEGORY_COUNT)
      .map((group) => lowerFirst(group.category.name)),
    hasMore: groups.length > LEDE_CATEGORY_COUNT,
  };
}

/** «128 товарів, перевірених за моделлю: чохли, … й решта. Усе тут підходить…» */
export function buildHubLede(hub: DeviceHubEntity): string {
  const { names, hasMore } = ledeCategories(hub.groups);
  return dict.devicePages.hub.lede(hub.productCount, names, hasMore);
}

/** The hub's own path — the canonical, the crumb and the JSON-LD URL. */
export function deviceHubPath(slug: string): string {
  return `/devices/${slug}`;
}

/** A group's «Усі …» target: the compatibility landing (TASK-490). */
export function compatLandingPath(categorySlug: string, modelSlug: string) {
  return `/catalog/${categorySlug}/${modelSlug}`;
}

/**
 * Where «Пристрої» links to — the «Мої пристрої» page `/devices` (TASK-2076).
 * `null` would render the crumb as plain text and drop it from the
 * BreadcrumbList (how it shipped before that page existed).
 */
export const DEVICES_INDEX_PATH: string | null = "/devices";

/**
 * The visible crumb trail. The last crumb is the hub itself (current page, no
 * link); an earlier crumb without `path` renders as plain text.
 */
export function deviceHubTrail(
  modelName: string,
  devicesIndexPath: string | null = DEVICES_INDEX_PATH,
): {
  name: string;
  path?: string;
}[] {
  const t = dict.devicePages.hub;
  return [
    { name: t.crumbHome, path: "/" },
    devicesIndexPath
      ? { name: t.crumbDevices, path: devicesIndexPath }
      : { name: t.crumbDevices },
    { name: t.heading(modelName) },
  ];
}
