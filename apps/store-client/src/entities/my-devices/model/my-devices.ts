// «Мої пристрої» (TASK-2074) — pure list logic, no storage, no React.
//
// A browser keeps any number of devices (own + family's). The list is ordered
// by `lastUsedAt` desc and the FIRST entry is the active device: it drives the
// «підходить» marks, the header categories, the DeviceHub links and the
// homepage panel. Account sync is TASK-1959 (post-release).

import {
  isDeviceFamily,
  type DeviceFamily,
} from "@/entities/device/model/device-family";

export interface MyDevice {
  modelId: string;
  slug: string;
  name: string;
  brandName: string;
  /** Resolved once when the device is added; `null` = neutral tone. */
  family: DeviceFamily | null;
  /** Optional owner's note — «Мама», «Робочий». Absent when not set. */
  label?: string;
  /** Epoch ms of the last add / activation; the ordering key. */
  lastUsedAt: number;
}

/** What a caller passes to add a device — the store stamps `lastUsedAt`. */
export type MyDeviceInput = Omit<MyDevice, "lastUsedAt">;

/** Labels are short tags shown inside a chip — capped so the chip survives. */
export const MAX_DEVICE_LABEL_LENGTH = 30;

// Stable empty reference: useSyncExternalStore snapshots must not churn.
export const EMPTY_DEVICES: readonly MyDevice[] = Object.freeze([]);

function normalizeLabel(label: unknown): string | undefined {
  if (typeof label !== "string") return undefined;
  const trimmed = label.trim().replace(/\s+/g, " ");
  return trimmed ? trimmed.slice(0, MAX_DEVICE_LABEL_LENGTH) : undefined;
}

function toDevice(value: unknown): MyDevice | null {
  if (typeof value !== "object" || value === null) return null;
  const v = value as Record<string, unknown>;
  if (typeof v.modelId !== "string" || v.modelId === "") return null;
  if (typeof v.slug !== "string" || v.slug === "") return null;
  if (typeof v.name !== "string" || v.name === "") return null;
  if (typeof v.lastUsedAt !== "number" || !Number.isFinite(v.lastUsedAt)) {
    return null;
  }
  const device: MyDevice = {
    modelId: v.modelId,
    slug: v.slug,
    name: v.name,
    brandName: typeof v.brandName === "string" ? v.brandName : "",
    // An unknown / future family key degrades to neutral, not to a dropped device.
    family: isDeviceFamily(v.family) ? v.family : null,
    lastUsedAt: v.lastUsedAt,
  };
  const label = normalizeLabel(v.label);
  if (label) device.label = label;
  return device;
}

/** Most-recent first; equal timestamps keep their relative order. */
export function sortByLastUsed(list: readonly MyDevice[]): MyDevice[] {
  return [...list].sort((a, b) => b.lastUsedAt - a.lastUsedAt);
}

/**
 * Parse the persisted JSON. Anything that is not an array of valid entries
 * (corrupt JSON, a foreign value under our key) yields the empty list; bad
 * entries are skipped and duplicate model ids keep the most recent one.
 */
export function parseMyDevices(raw: string | null): readonly MyDevice[] {
  if (!raw) return EMPTY_DEVICES;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return EMPTY_DEVICES;
  }
  if (!Array.isArray(parsed)) return EMPTY_DEVICES;
  const seen = new Set<string>();
  const out: MyDevice[] = [];
  for (const device of sortByLastUsed(
    parsed.map(toDevice).filter((d): d is MyDevice => d !== null),
  )) {
    if (seen.has(device.modelId)) continue;
    seen.add(device.modelId);
    out.push(device);
  }
  return out.length > 0 ? out : EMPTY_DEVICES;
}

export function serializeMyDevices(list: readonly MyDevice[]): string {
  return JSON.stringify(list);
}

/** The active device — the first one — or `null` when none is saved. */
export function getActiveDevice(list: readonly MyDevice[]): MyDevice | null {
  return list[0] ?? null;
}

/**
 * A timestamp strictly newer than every entry, so the touched device is
 * first even when two actions land in the same millisecond or the clock
 * stepped back.
 */
function nextStamp(list: readonly MyDevice[], now: number): number {
  const newest = list.reduce((max, d) => Math.max(max, d.lastUsedAt), 0);
  return Math.max(now, newest + 1);
}

/**
 * Add a device, or refresh one already saved, and make it active. A saved
 * label survives a re-add that carries none.
 */
export function upsertDevice(
  list: readonly MyDevice[],
  input: MyDeviceInput,
  now: number,
): MyDevice[] {
  const existing = list.find((d) => d.modelId === input.modelId);
  const label = normalizeLabel(input.label) ?? existing?.label;
  const device: MyDevice = {
    modelId: input.modelId,
    slug: input.slug,
    name: input.name,
    brandName: input.brandName,
    family: input.family,
    lastUsedAt: nextStamp(list, now),
  };
  if (label) device.label = label;
  return [device, ...list.filter((d) => d.modelId !== input.modelId)];
}

/** Make a saved device active (moves it first). Unknown id → unchanged. */
export function activateDevice(
  list: readonly MyDevice[],
  modelId: string,
  now: number,
): readonly MyDevice[] {
  const target = list.find((d) => d.modelId === modelId);
  if (!target || list[0]?.modelId === modelId) return list;
  return [
    { ...target, lastUsedAt: nextStamp(list, now) },
    ...list.filter((d) => d.modelId !== modelId),
  ];
}

/** Forget a device; if it was active, the next one becomes active. */
export function removeDeviceFrom(
  list: readonly MyDevice[],
  modelId: string,
): readonly MyDevice[] {
  const next = list.filter((d) => d.modelId !== modelId);
  return next.length === list.length ? list : next;
}

/**
 * Set or clear (empty / whitespace) a device's label. Does not touch the
 * order — labelling on the My devices page is not "using" the device.
 */
export function setDeviceLabel(
  list: readonly MyDevice[],
  modelId: string,
  label: string | null | undefined,
): readonly MyDevice[] {
  if (!list.some((d) => d.modelId === modelId)) return list;
  const normalized = normalizeLabel(label);
  return list.map((d) => {
    if (d.modelId !== modelId) return d;
    const { label: _previous, ...rest } = d;
    void _previous;
    return normalized ? { ...rest, label: normalized } : rest;
  });
}
