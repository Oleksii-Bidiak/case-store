/**
 * «З урахуванням моїх пристроїв» (TASK-2077) — the catalogue filter that reads
 * the shopper's saved devices, as pure state over the ONE `?device=` param.
 *
 * There is no `scope=` key (the mockup has `compat=` / `scope=`), and `compat=`
 * only ever carries `off` — see `catalogDeviceParam`: the filter writes
 * explicit model slugs — `device=iphone-15-pro` for the active device,
 * `device=iphone-15-pro,iphone-13` for «для всіх моїх» (the API OR-s them).
 * So a shared link reproduces the listing in any browser, saved devices or
 * not, and the brand → model cascade (TASK-190) and the chips row keep reading
 * the same param instead of a parallel one.
 *
 * Which mode the panel shows is DERIVED from that param against the saved
 * list, never stored: a link naming someone else's device simply reads as
 * «other» here.
 */

import type { MyDevice } from "@/entities/my-devices";

/**
 * The API rejects `device=` with more than 20 distinct slugs (400,
 * `MAX_DEVICE_FILTER_SLUGS` in store-api), while «Мої пристрої» has no limit
 * (TASK-2074) — so «для всіх моїх» writes the 20 most recently used (TASK-2094).
 */
export const MAX_DEVICE_FILTER_SLUGS = 20;

/** Saved devices listed as radios before «Ще N — обрати інший» (mockup §11). */
export const MY_DEVICES_RADIO_LIMIT = 4;

export type MyDevicesFilterState =
  /** No `?device=` — every product. */
  | { mode: "off" }
  /** Exactly one slug, and it is a saved device. */
  | { mode: "active"; device: MyDevice }
  /**
   * Exactly the slugs «для всіх моїх» writes for the CURRENT saved list (the
   * 20 most recent), in any order («для всіх моїх»).
   */
  | { mode: "all"; devices: MyDevice[] }
  /**
   * A device filter the saved list does not explain: the cascade's pick, a
   * shared link from another browser, or a stale «для всіх моїх» URL. Still
   * applied; the panel's switch is off and its note says the listing is
   * filtered by another device.
   */
  | { mode: "other"; slugs: string[] };

/** `a, b,a` → `["a", "b"]`: trimmed, de-duplicated, blanks dropped. */
export function parseDeviceParam(value: string | null | undefined): string[] {
  if (!value) return [];
  const out: string[] = [];
  for (const raw of value.split(",")) {
    const slug = raw.trim();
    if (slug && !out.includes(slug)) out.push(slug);
  }
  return out;
}

/** Read the panel's mode from the URL's `device` and the saved list. */
export function resolveMyDevicesFilter(
  deviceParam: string | null | undefined,
  devices: readonly MyDevice[],
): MyDevicesFilterState {
  const slugs = parseDeviceParam(deviceParam);
  if (slugs.length === 0) return { mode: "off" };

  const matched = slugs
    .map((slug) => devices.find((d) => d.slug === slug))
    .filter((d): d is MyDevice => d !== undefined);
  if (matched.length !== slugs.length) return { mode: "other", slugs };

  if (matched.length === 1) return { mode: "active", device: matched[0] };

  // «Для всіх моїх» only while the URL names exactly what the switch would
  // write now — a URL from before a device was added or forgotten is a
  // stale subset and reads as «other», so no count disagrees with the grid.
  const allSlugs = parseDeviceParam(allMyDevicesParam(devices));
  const isAll =
    allSlugs.length === slugs.length &&
    allSlugs.every((slug) => slugs.includes(slug));
  return isAll ? { mode: "all", devices: matched } : { mode: "other", slugs };
}

/** Is the panel's switch on — the device filter comes from «Мої пристрої»? */
export function isMyDevicesFilterOn(state: MyDevicesFilterState): boolean {
  return state.mode === "active" || state.mode === "all";
}

/** `device=` for «для всіх моїх»: most-recent first, capped at 20. */
export function allMyDevicesParam(devices: readonly MyDevice[]): string {
  return devices
    .slice(0, MAX_DEVICE_FILTER_SLUGS)
    .map((d) => d.slug)
    .join(",");
}

// ── the catalogue default (Д3-2 Catalog §11 / §20, TASK-2076) ─────────────

/**
 * `?compat=off` — the one thing the URL has to say beyond `device=`: «the
 * shopper switched the filter off here». Without it a catalogue URL with no
 * `device=` takes the default below, so «off» could never stick.
 */
export const COMPAT_PARAM = "compat";
export const COMPAT_OFF = "off";

/** Where the catalogue filter starts — the «Мої пристрої» settings' shape. */
export interface MyDevicesFilterDefault {
  on: boolean;
  scope: "active" | "all";
}

/**
 * The catalogue default when no settings are passed in: ON for the active
 * device (brief §20) — also what the «Мої пристрої» settings default to. The
 * settings themselves (`compatOnly` / `compatScope`) live in a widget a
 * feature cannot import, so the route's client shell reads them and hands
 * them down as `defaults`.
 */
export const CATALOG_MY_DEVICES_DEFAULT: Readonly<MyDevicesFilterDefault> =
  Object.freeze({ on: true, scope: "active" });

/**
 * The `device=` the catalogue lists by: the URL's own when it names one (a
 * shared link reproduces itself), nothing after an explicit `compat=off`,
 * else the default — the active device, or every saved device for
 * «Для всіх моїх» (only meaningful with more than one).
 */
export function catalogDeviceParam(
  urlDevice: string | null | undefined,
  compat: string | null | undefined,
  devices: readonly MyDevice[],
  defaults: Readonly<MyDevicesFilterDefault> = CATALOG_MY_DEVICES_DEFAULT,
): string | undefined {
  if (urlDevice) return urlDevice;
  if (compat === COMPAT_OFF || !defaults.on || devices.length === 0) {
    return undefined;
  }
  return defaults.scope === "all" && devices.length > 1
    ? allMyDevicesParam(devices)
    : devices[0].slug;
}

/**
 * Complete a filter update for the catalogue URL: whoever clears `device=`
 * (the switch, the chip, «Очистити все», «Показати всі») also writes
 * `compat=off` so the default does not put it straight back; whoever sets it
 * drops the marker. Only where a default applies (saved devices and the
 * default on) — elsewhere the marker would be noise in the link.
 */
export function withCompatMarker(
  updates: Record<string, string | undefined>,
  defaultApplies: boolean,
): Record<string, string | undefined> {
  if (!("device" in updates)) return updates;
  return {
    ...updates,
    [COMPAT_PARAM]: updates.device || !defaultApplies ? undefined : COMPAT_OFF,
  };
}

/**
 * The URL update for switching the filter on (the active device — the first
 * saved one) or off (no device at all). `undefined` removes the param.
 */
export function myDevicesSwitchUpdate(
  on: boolean,
  devices: readonly MyDevice[],
): { device: string | undefined } {
  const active = devices[0];
  return { device: on && active ? active.slug : undefined };
}
