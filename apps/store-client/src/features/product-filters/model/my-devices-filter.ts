/**
 * «З урахуванням моїх пристроїв» (TASK-2077) — the catalogue filter that reads
 * the shopper's saved devices, as pure state over the ONE `?device=` param.
 *
 * There is no second URL key (`compat=` / `scope=` in the mockup): the filter
 * writes explicit model slugs — `device=iphone-15-pro` for the active device,
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
  /** Two or more slugs, every one a saved device («для всіх моїх»). */
  | { mode: "all"; devices: MyDevice[] }
  /**
   * A device filter the saved list does not explain: the cascade's pick, or
   * a shared link from another browser. Still applied; the panel shows off.
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
  return { mode: "all", devices: matched };
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
