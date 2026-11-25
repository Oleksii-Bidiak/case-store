// «Мої пристрої» settings (TASK-2076) — the two switches of the settings panel,
// which are the DEFAULTS of the catalogue filter «З урахуванням моїх
// пристроїв» (TASK-2077):
//   - compatOnly  — the filter starts ON (only what fits);
//   - compatScope — when on, for the active device or for ALL saved devices.
//
// Client-only, like the device list itself (localStorage: cached HTML stays
// personal-content-free); only the default filter they produce is mirrored
// into the `catalog-device` cookie (TASK-2564, ./catalog-device-cookie).
// Lives in entities/my-devices since TASK-1959 — the account sync (features/my-devices-sync) reads and writes it
// next to the device list; widgets/my-devices-manager re-exports it.
//
// This file stays server-safe (no React import): the widget barrel is imported
// by the server page app/devices, and a hook here would break the RSC build.
// The hook lives in the "use client" module ./use-my-devices-settings.

import { hasDeviceFlag, syncDeviceFlags } from "./device-flags";
import { syncCatalogDeviceCookie } from "./catalog-device-cookie";
import { notifyMyDevicesEdit } from "./my-devices-edits";

export const MY_DEVICES_SETTINGS_STORAGE_KEY = "my-devices-settings:v1";

export type CompatScope = "active" | "all";

export interface MyDevicesSettings {
  /** «У каталозі — лише сумісне»: the catalogue filter starts on. */
  compatOnly: boolean;
  /** «Для всіх моїх пристроїв» — stored even while compatOnly is off. */
  compatScope: CompatScope;
}

export const DEFAULT_MY_DEVICES_SETTINGS: Readonly<MyDevicesSettings> =
  Object.freeze({ compatOnly: true, compatScope: "active" });

/** Corrupt / foreign JSON → defaults; each field falls back on its own. */
export function parseMyDevicesSettings(
  raw: string | null,
): Readonly<MyDevicesSettings> {
  if (!raw) return DEFAULT_MY_DEVICES_SETTINGS;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return DEFAULT_MY_DEVICES_SETTINGS;
  }
  if (typeof parsed !== "object" || parsed === null) {
    return DEFAULT_MY_DEVICES_SETTINGS;
  }
  const v = parsed as Record<string, unknown>;
  return {
    compatOnly:
      typeof v.compatOnly === "boolean"
        ? v.compatOnly
        : DEFAULT_MY_DEVICES_SETTINGS.compatOnly,
    compatScope:
      v.compatScope === "all" || v.compatScope === "active"
        ? v.compatScope
        : DEFAULT_MY_DEVICES_SETTINGS.compatScope,
  };
}

/**
 * What the catalogue filter should start with: off, or on for the active
 * device / for all saved devices. «Для всіх» only counts while «лише
 * сумісне» is on — the panel disables it otherwise, keeping the stored value.
 */
export function catalogFilterDefault(settings: Readonly<MyDevicesSettings>): {
  on: boolean;
  scope: CompatScope;
} {
  return settings.compatOnly
    ? { on: true, scope: settings.compatScope }
    : { on: false, scope: "active" };
}

// ── storage ───────────────────────────────────────────────────────────────

const listeners = new Set<() => void>();
let memoryRaw: string | null = null;
let useMemory = false;

function readRaw(): string | null {
  if (useMemory) return memoryRaw;
  try {
    return window.localStorage.getItem(MY_DEVICES_SETTINGS_STORAGE_KEY);
  } catch {
    useMemory = true;
    return memoryRaw;
  }
}

function writeRaw(raw: string | null): void {
  memoryRaw = raw;
  if (useMemory) return;
  try {
    if (raw === null) {
      window.localStorage.removeItem(MY_DEVICES_SETTINGS_STORAGE_KEY);
    } else {
      window.localStorage.setItem(MY_DEVICES_SETTINGS_STORAGE_KEY, raw);
    }
  } catch {
    useMemory = true;
  }
}

/**
 * Whether this browser ever stored settings — i.e. the shopper touched the
 * panel. The account sync merges only what was actually chosen (TASK-1959).
 */
export function hasStoredMyDevicesSettings(): boolean {
  if (typeof window === "undefined") return false;
  return readRaw() !== null;
}

let cachedRaw: string | null = null;
let cachedSettings: Readonly<MyDevicesSettings> = DEFAULT_MY_DEVICES_SETTINGS;

/** Store snapshot for useSyncExternalStore (cached per raw value). */
export function getMyDevicesSettingsSnapshot(): Readonly<MyDevicesSettings> {
  const raw = readRaw();
  if (raw === cachedRaw) return cachedSettings;
  cachedRaw = raw;
  cachedSettings = parseMyDevicesSettings(raw);
  return cachedSettings;
}

/** Store subscription for useSyncExternalStore (same tab + other tabs). */
export function subscribeMyDevicesSettings(onChange: () => void): () => void {
  listeners.add(onChange);
  const onStorage = (event: StorageEvent) => {
    if (event.key === null || event.key === MY_DEVICES_SETTINGS_STORAGE_KEY) {
      syncFlags();
      onChange();
    }
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(onChange);
    window.removeEventListener("storage", onStorage);
  };
}

/**
 * Keep `data-device-filter` (TASK-2421) and the `catalog-device` cookie
 * (TASK-2564) in line with the settings. The device half is what the device
 * store last published — `data-has-device` on <html>, the list in the cookie
 * module: importing that store here would close an import cycle.
 */
function syncFlags(): void {
  const settings = getMyDevicesSettingsSnapshot();
  syncDeviceFlags(hasDeviceFlag(), settings.compatOnly);
  syncCatalogDeviceCookie(null, settings);
}

/** Plain read for non-React callers (server-safe: defaults on the server). */
export function readMyDevicesSettings(): Readonly<MyDevicesSettings> {
  if (typeof window === "undefined") return DEFAULT_MY_DEVICES_SETTINGS;
  return getMyDevicesSettingsSnapshot();
}

/** Change one or both settings; listeners in this tab re-render. */
export function updateMyDevicesSettings(
  patch: Partial<MyDevicesSettings>,
): void {
  if (typeof window === "undefined") return;
  const current = getMyDevicesSettingsSnapshot();
  const next = { ...current, ...patch };
  if (
    next.compatOnly === current.compatOnly &&
    next.compatScope === current.compatScope
  ) {
    return;
  }
  writeRaw(JSON.stringify(next));
  syncFlags();
  for (const listener of listeners) listener();
  // The shopper's own change — the account sync pushes it (TASK-1959).
  notifyMyDevicesEdit();
}

/**
 * Apply settings that came FROM the account (TASK-1959) without reporting an
 * edit — no echo back to the server. `null` forgets them (back to defaults).
 */
export function replaceMyDevicesSettings(
  settings: Readonly<MyDevicesSettings> | null,
): void {
  if (typeof window === "undefined") return;
  const raw =
    settings === null
      ? null
      : JSON.stringify({
          compatOnly: settings.compatOnly,
          compatScope: settings.compatScope,
        });
  if (raw === readRaw()) return;
  writeRaw(raw);
  syncFlags();
  for (const listener of listeners) listener();
}

/** Back to the defaults (tests, a future «reset»). */
export function resetMyDevicesSettings(): void {
  updateMyDevicesSettings(DEFAULT_MY_DEVICES_SETTINGS);
}
