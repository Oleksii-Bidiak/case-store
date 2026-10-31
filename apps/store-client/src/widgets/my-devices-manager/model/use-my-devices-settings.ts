"use client";

// The live «Мої пристрої» settings hook, split from ./my-devices-settings so
// that module stays server-safe (the widget barrel reaches server pages).

import { useSyncExternalStore } from "react";
import {
  DEFAULT_MY_DEVICES_SETTINGS,
  getMyDevicesSettingsSnapshot,
  subscribeMyDevicesSettings,
  type MyDevicesSettings,
} from "./my-devices-settings";

const getServerSnapshot = () => DEFAULT_MY_DEVICES_SETTINGS;

/** The settings, live (defaults during SSR and hydration). */
export function useMyDevicesSettings(): Readonly<MyDevicesSettings> {
  return useSyncExternalStore(
    subscribeMyDevicesSettings,
    getMyDevicesSettingsSnapshot,
    getServerSnapshot,
  );
}
