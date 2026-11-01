// «Мої пристрої» persistence — an external store over localStorage, read with
// useSyncExternalStore (same pattern as widgets/recently-viewed). Client-only
// by design: no cookie, no header, so ISR pages stay personal-content-free and
// the server snapshot is always the empty list.

import {
  EMPTY_DEVICES,
  activateDevice,
  parseMyDevices,
  removeDeviceFrom,
  serializeMyDevices,
  setDeviceLabel,
  upsertDevice,
  type MyDevice,
  type MyDeviceInput,
} from "./my-devices";

export const MY_DEVICES_STORAGE_KEY = "my-devices:v1";

const listeners = new Set<() => void>();

// When localStorage throws (Safari private mode, quota, disabled storage) the
// list lives in memory for the tab's lifetime instead of silently not saving.
let memoryRaw: string | null = null;
let useMemory = false;

function readRaw(): string | null {
  if (useMemory) return memoryRaw;
  try {
    return window.localStorage.getItem(MY_DEVICES_STORAGE_KEY);
  } catch {
    useMemory = true;
    return memoryRaw;
  }
}

function writeRaw(raw: string | null): void {
  memoryRaw = raw;
  if (useMemory) return;
  try {
    if (raw === null) window.localStorage.removeItem(MY_DEVICES_STORAGE_KEY);
    else window.localStorage.setItem(MY_DEVICES_STORAGE_KEY, raw);
  } catch {
    useMemory = true;
  }
}

function emit(): void {
  for (const listener of listeners) listener();
}

// getSnapshot must return the same reference while the data is unchanged —
// cache the parsed list keyed by the raw string.
let cachedRaw: string | null = null;
let cachedList: readonly MyDevice[] = EMPTY_DEVICES;

export function getMyDevicesSnapshot(): readonly MyDevice[] {
  const raw = readRaw();
  if (raw === cachedRaw) return cachedList;
  cachedRaw = raw;
  cachedList = parseMyDevices(raw);
  return cachedList;
}

export function getMyDevicesServerSnapshot(): readonly MyDevice[] {
  return EMPTY_DEVICES;
}

export function subscribeMyDevices(onChange: () => void): () => void {
  listeners.add(onChange);
  // Cross-tab sync: another tab wrote our key (or cleared all storage).
  const onStorage = (event: StorageEvent) => {
    if (event.key === null || event.key === MY_DEVICES_STORAGE_KEY) onChange();
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(onChange);
    window.removeEventListener("storage", onStorage);
  };
}

/** Plain read (server-safe: empty on the server). */
export function readMyDevices(): readonly MyDevice[] {
  if (typeof window === "undefined") return EMPTY_DEVICES;
  return getMyDevicesSnapshot();
}

function update(
  change: (list: readonly MyDevice[]) => readonly MyDevice[],
): void {
  if (typeof window === "undefined") return;
  const current = getMyDevicesSnapshot();
  const next = change(current);
  if (next === current) return;
  writeRaw(next.length > 0 ? serializeMyDevices(next) : null);
  emit();
}

/** Save a device (or refresh a saved one) and make it the active device. */
export function addDevice(input: MyDeviceInput): void {
  update((list) => upsertDevice(list, input, Date.now()));
}

/** Make a saved device active. Unknown id → no-op. */
export function setActiveDevice(modelId: string): void {
  update((list) => activateDevice(list, modelId, Date.now()));
}

/** Forget a device; the next most-recent one becomes active. */
export function removeDevice(modelId: string): void {
  update((list) => removeDeviceFrom(list, modelId));
}

/** Set a label («Мама»); an empty / whitespace label clears it. */
export function setDeviceLabelById(
  modelId: string,
  label: string | null,
): void {
  update((list) => setDeviceLabel(list, modelId, label));
}

/** Forget every saved device. */
export function clearMyDevices(): void {
  update((list) => (list.length === 0 ? list : EMPTY_DEVICES));
}
