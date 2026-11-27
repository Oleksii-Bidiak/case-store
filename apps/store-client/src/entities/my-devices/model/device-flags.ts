// The two «Мої пристрої» flags on <html> (TASK-2074, TASK-2421, TASK-2410).
// Set before first paint by the inline script in the root layout's <head>
// (./pre-paint-flags.ts) and kept live afterwards by the stores' writes, so
// CSS can lay a page out for the shopper's devices before React knows them:
//
//   - `data-has-device`    — at least one device is saved: the header reserves
//     tier 2 at ≥ 1024, the device hero holds its place, the cards keep their
//     device-fit slot (a visitor without a device gets no empty slot);
//   - `data-device-filter` — a device is saved AND «У каталозі — лише сумісне»
//     is on: the catalogue's default filter will apply after hydration, so the
//     unfiltered server grid and counts stay hidden behind a skeleton.
//
// Attributes only — nothing personal reaches the cached HTML (SF-CAT-87).
// No imports on purpose: both stores call `syncDeviceFlags`, and the pre-paint
// script imports their storage keys; keeping this module a leaf keeps the
// import graph acyclic.

export const HAS_DEVICE_ATTR = "data-has-device";
export const DEVICE_FILTER_ATTR = "data-device-filter";

/**
 * Set by the pre-paint script {@link PRE_PAINT_FILTER_TIMEOUT_MS} after the
 * window's `load` event, when it set `data-device-filter`: if the app never
 * hydrated by then (a blocked or failed bundle), CSS gives the skeleton up and
 * shows the server grid — the unfiltered list beats an endless skeleton.
 * Counted from `load`, not from <head> (TASK-2564): on a slow network the
 * bundle's download alone outlasted a fixed budget and lifted the gate before
 * hydration. After hydration it changes nothing: the pending classes are gone
 * by then.
 */
export const DEVICE_FILTER_EXPIRED_ATTR = "data-device-filter-expired";
export const PRE_PAINT_FILTER_TIMEOUT_MS = 4000;

/** Whether <html> is currently flagged as having a saved device. */
export function hasDeviceFlag(): boolean {
  if (typeof document === "undefined") return false;
  return document.documentElement.hasAttribute(HAS_DEVICE_ATTR);
}

/**
 * Bring both flags in line with the stores — called after every write of the
 * device list or the settings (the shopper's own and the account's), and when
 * another tab writes them. Same rule as the pre-paint script.
 */
export function syncDeviceFlags(hasDevice: boolean, compatOnly: boolean): void {
  if (typeof document === "undefined") return;
  const html = document.documentElement;
  html.toggleAttribute(HAS_DEVICE_ATTR, hasDevice);
  html.toggleAttribute(DEVICE_FILTER_ATTR, hasDevice && compatOnly);
}
