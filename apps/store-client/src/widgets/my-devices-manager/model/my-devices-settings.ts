// «Мої пристрої» settings (TASK-2076) — the two switches of the settings panel,
// which are the DEFAULTS of the catalogue filter «З урахуванням моїх
// пристроїв» (TASK-2077):
//   - compatOnly  — the filter starts ON (only what fits);
//   - compatScope — when on, for the active device or for ALL saved devices.
//
// Client-only, like the device list itself (localStorage, no cookie: cached
// HTML stays personal-content-free). Kept in this widget rather than in
// entities/my-devices because that slice belongs to another SД3 cluster — the
// catalogue reads it through `readMyDevicesSettings` / `useMyDevicesSettings`.
//
// This file stays server-safe (no React import): the widget barrel is imported
// by the server page app/devices, and a hook here would break the RSC build.
// The hook lives in the "use client" module ./use-my-devices-settings.

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

function writeRaw(raw: string): void {
  memoryRaw = raw;
  if (useMemory) return;
  try {
    window.localStorage.setItem(MY_DEVICES_SETTINGS_STORAGE_KEY, raw);
  } catch {
    useMemory = true;
  }
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
      onChange();
    }
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(onChange);
    window.removeEventListener("storage", onStorage);
  };
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
  for (const listener of listeners) listener();
}

/** Back to the defaults (tests, a future «reset»). */
export function resetMyDevicesSettings(): void {
  updateMyDevicesSettings(DEFAULT_MY_DEVICES_SETTINGS);
}
