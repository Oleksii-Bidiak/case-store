"use client";

import { useSyncExternalStore } from "react";

import { getActiveDevice, type MyDevice } from "./my-devices";
import {
  getMyDevicesServerSnapshot,
  getMyDevicesSnapshot,
  subscribeMyDevices,
} from "./my-devices-storage";

/**
 * Saved devices, most-recent first (the first is active). Empty during SSR
 * and the hydration render — pair with `useMyDevicesHydrated` to reserve
 * space with a skeleton instead of flashing the "no device" state.
 */
export function useMyDevices(): readonly MyDevice[] {
  return useSyncExternalStore(
    subscribeMyDevices,
    getMyDevicesSnapshot,
    getMyDevicesServerSnapshot,
  );
}

/** The active device, or `null` when none is saved (and on the server). */
export function useActiveDevice(): MyDevice | null {
  return getActiveDevice(useMyDevices());
}

const noopSubscribe = () => () => {};

/**
 * `false` on the server and during hydration, `true` once the client
 * snapshot is in use — i.e. once an empty list really means "no devices".
 */
export function useMyDevicesHydrated(): boolean {
  return useSyncExternalStore(
    noopSubscribe,
    () => true,
    () => false,
  );
}
