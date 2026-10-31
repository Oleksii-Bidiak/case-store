// «Підходить / не підходить» (TASK-1953) — pure logic, no React, no storage.
//
// The API sends every compatible device-model id with a product
// (`compatibleDeviceModelIds`, one batched query per page); the shopper's
// active device lives only in the browser (`entities/my-devices`). The verdict
// is therefore computed here, on the client, after hydration.

import {
  getDeviceFamily,
  type DeviceFamily,
  type DeviceFamilySource,
} from "@/entities/device";
import type { MyDevice } from "@/entities/my-devices";

/**
 * `fits` / `no-fit` — a verdict for the active device.
 * `null` — no verdict: the product carries no compatibility data (an
 * accessory that works with anything, or one not mapped yet), or no device
 * is saved. Callers render NOTHING for `null` — never a guessed «не підходить».
 */
export type DeviceFitVerdict = "fits" | "no-fit";

export function getDeviceFit(
  compatibleDeviceModelIds: readonly string[] | null | undefined,
  device: Pick<MyDevice, "modelId"> | null | undefined,
): DeviceFitVerdict | null {
  if (!device || !compatibleDeviceModelIds?.length) return null;
  return compatibleDeviceModelIds.includes(device.modelId) ? "fits" : "no-fit";
}

/** True when the product declares any compatibility at all. */
export function hasCompatData(
  compatibleDeviceModelIds: readonly string[] | null | undefined,
): boolean {
  return (compatibleDeviceModelIds?.length ?? 0) > 0;
}

/** «iPhone 13 · Мама» — the device name with its owner's label, if any. */
export function deviceDisplayName(
  device: Pick<MyDevice, "name" | "label">,
): string {
  return device.label ? `${device.name} · ${device.label}` : device.name;
}

/**
 * The compact name a card mark uses («Watch S10 46mm», «iPad 10») — the
 * mockup's `short`. The device store keeps only the full catalogue name, so
 * the few long, predictable phrasings are condensed here; anything else is
 * returned unchanged. Not for places where the full name matters (PDP titles).
 */
export function deviceShortName(name: string): string {
  return name
    .replace(/^Apple\s+(?=Watch\b)/, "")
    .replace(/\bSeries\s+(\d+)/, "S$1")
    .replace(/\b(\d+)(?:st|nd|rd|th)\s+gen(?:eration)?\b/i, "$1")
    .replace(/(\d+)-(?:го|ого)\s+покоління/, "$1")
    .replace(/\s+/g, " ")
    .trim();
}

/** «Все для <модель>» — the device hub (TASK-1954). */
export function deviceHubHref(slug: string): string {
  return `/devices/${encodeURIComponent(slug)}`;
}

/**
 * The first `limit` model names joined with commas, plus how many are left
 * unnamed — the caller words the tail («та ще 3 моделі»).
 */
export function summarizeModelNames(
  models: readonly { name: string }[],
  limit = 3,
): { names: string; rest: number } {
  const shown = models.slice(0, limit).map((m) => m.name);
  return {
    names: shown.join(", "),
    rest: Math.max(0, models.length - shown.length),
  };
}

/**
 * The one family every target model belongs to, or `null` when they span
 * several families (or none can be placed). Tints the PDP «ask» row — the
 * only place a family tone may appear next to a compatibility answer.
 */
export function commonDeviceFamily(
  models: readonly DeviceFamilySource[],
): DeviceFamily | null {
  let family: DeviceFamily | null = null;
  for (const model of models) {
    const next = getDeviceFamily(model);
    if (!next) return null;
    if (family && next !== family) return null;
    family = next;
  }
  return family;
}
