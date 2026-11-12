// Whose account the local «Мої пристрої» mirror belongs to (TASK-1959).
//
// While signed in, localStorage keeps a COPY of the account's devices so the
// synchronous reads (pre-paint flag, tab sync, every `useMyDevices`) keep
// working unchanged. The marker records which user that copy came from:
//   - absent         — a guest's own list: merge it into the account on sign-in;
//   - this user's id — our mirror: refresh it from the server;
//   - another id     — someone else's mirror on a shared computer: discard it.

import { readMyDevices } from "./my-devices-storage";
import { hasStoredMyDevicesSettings } from "./my-devices-settings";

export const MY_DEVICES_OWNER_STORAGE_KEY = "my-devices-owner:v1";

let memoryOwner: string | null = null;
let useMemory = false;

/** The user id the local mirror belongs to, or `null` for a guest's own list. */
export function readMyDevicesOwner(): string | null {
  if (typeof window === "undefined") return null;
  if (useMemory) return memoryOwner;
  try {
    return window.localStorage.getItem(MY_DEVICES_OWNER_STORAGE_KEY);
  } catch {
    useMemory = true;
    return memoryOwner;
  }
}

/** Record (or with `null`, forget) whose mirror the local copy is. */
export function writeMyDevicesOwner(userId: string | null): void {
  if (typeof window === "undefined") return;
  memoryOwner = userId;
  if (useMemory) return;
  try {
    if (userId === null) {
      window.localStorage.removeItem(MY_DEVICES_OWNER_STORAGE_KEY);
    } else {
      window.localStorage.setItem(MY_DEVICES_OWNER_STORAGE_KEY, userId);
    }
  } catch {
    useMemory = true;
  }
}

/** Anything a guest saved that is worth merging: a device or a settings choice. */
export function hasLocalMyDevicesState(): boolean {
  return readMyDevices().length > 0 || hasStoredMyDevicesSettings();
}
