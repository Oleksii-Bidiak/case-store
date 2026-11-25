// The catalogue's default device filter as a cookie (TASK-2564).
//
// The saved devices live in localStorage, which the server cannot read. Until
// TASK-2564 the catalogue's server render therefore prefetched the UNFILTERED
// listing and the default filter landed only after hydration; TASK-2421 hid
// that grid behind a CSS gate, but on a slow phone hydration outlasts the
// gate and the unfiltered grid showed anyway. This cookie carries the one
// thing the server needs — the `device=` the default filter will apply — so
// `/categories/[slug]` and `/products` prefetch the filtered listing and the
// first HTML is already the right grid.
//
// Written by the pre-paint script (./pre-paint-flags.ts, for lists saved
// before this cookie existed) and next to every flag sync of both stores.
// Read only by those two dynamic routes: the ISR device hubs never read it
// (SF-CAT-87). It holds model slugs only, the same that a shared catalogue
// link carries.
//
// Imports `./my-devices` for the type only; the stores import this module, so
// it must not import them back.

import type { MyDevice } from "./my-devices";

export const CATALOG_DEVICE_COOKIE = "catalog-device";

/**
 * How many slugs «для всіх моїх» writes — the API's `MAX_DEVICE_FILTER_SLUGS`,
 * the same cap `allMyDevicesParam` (features/product-filters) applies.
 */
export const CATALOG_DEVICE_MAX_SLUGS = 20;

/** One year: the cookie outlives a visit, like the saved list itself. */
export const CATALOG_DEVICE_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

/** The settings half the default needs (structurally `MyDevicesSettings`). */
interface CatalogDefaultSettings {
  compatOnly: boolean;
  compatScope: "active" | "all";
}

/**
 * The `device=` the catalogue's default filter applies with no `device` and
 * no `compat=off` in the URL — `catalogDeviceParam` of features/product-filters
 * with `catalogFilterDefault(settings)`, written here because an entity
 * cannot import a feature: nothing when «лише сумісне» is off or no device is
 * saved, the active device's slug, or the 20 most recent for «для всіх моїх»
 * (only with more than one device).
 */
export function defaultCatalogDevice(
  devices: readonly MyDevice[],
  settings: Readonly<CatalogDefaultSettings>,
): string | undefined {
  if (!settings.compatOnly || devices.length === 0) return undefined;
  if (settings.compatScope === "all" && devices.length > 1) {
    return devices
      .slice(0, CATALOG_DEVICE_MAX_SLUGS)
      .map((d) => d.slug)
      .join(",");
  }
  return devices[0].slug;
}

const SLUG = /^[a-z0-9][a-z0-9-]{0,119}$/i;

/**
 * The server's read of the cookie: the value only when every slug is a plain
 * slug and there are at most 20 of them — anything else is ignored, never
 * sent on to the API.
 */
export function parseCatalogDeviceCookie(
  value: string | null | undefined,
): string | undefined {
  if (!value) return undefined;
  const slugs = value.split(",");
  if (slugs.length > CATALOG_DEVICE_MAX_SLUGS) return undefined;
  return slugs.every((slug) => SLUG.test(slug)) ? value : undefined;
}

/** Set the cookie to `value`, or delete it when there is none. */
export function writeCatalogDeviceCookie(value: string | undefined): void {
  if (typeof document === "undefined") return;
  document.cookie = value
    ? `${CATALOG_DEVICE_COOKIE}=${encodeURIComponent(value)}; path=/; max-age=${CATALOG_DEVICE_COOKIE_MAX_AGE}; samesite=lax`
    : `${CATALOG_DEVICE_COOKIE}=; path=/; max-age=0; samesite=lax`;
}

// The device list as the device store last reported it. The settings store
// cannot import the device store (it is imported by it), so a settings write
// recomputes the cookie from this — the same split `data-has-device` uses.
let knownDevices: readonly MyDevice[] | null = null;

/**
 * Bring the cookie in line with the stores. The device store passes both
 * halves; the settings store passes its own and reuses the list the device
 * store reported last (before that — no client mount yet — it writes nothing:
 * the device store's first-mount sync will).
 */
export function syncCatalogDeviceCookie(
  devices: readonly MyDevice[] | null,
  settings: Readonly<CatalogDefaultSettings>,
): void {
  if (devices !== null) knownDevices = devices;
  if (knownDevices === null) return;
  writeCatalogDeviceCookie(defaultCatalogDevice(knownDevices, settings));
}
