"use client";

import {
  EMPTY_DEVICES,
  useMyDevices,
  useMyDevicesHydrated,
  type MyDevice,
} from "@/entities/my-devices";

import { getDeviceFit, type DeviceFitVerdict } from "./device-fit";

export interface DeviceFitState {
  /**
   * `false` on the server and during the hydration render. Until then an
   * empty device list does not mean "no device" — render no verdict and keep
   * the reserved space, so a saved device never flashes «Не для …».
   */
  hydrated: boolean;
  /** The active device (the most recently used), or `null`. */
  device: MyDevice | null;
  /** Every saved device, active first. */
  devices: readonly MyDevice[];
  /** The verdict for the active device; `null` = render no mark. */
  verdict: DeviceFitVerdict | null;
}

/**
 * Compare a product's compatible model ids with the shopper's active device.
 * Client-only state (localStorage, `entities/my-devices`) — the server render
 * and the hydration render always get `{ hydrated: false, verdict: null }`,
 * so cached HTML never carries personal content. Re-renders live when the
 * active device changes anywhere (header chip, picker, another tab).
 */
export function useDeviceFit(
  compatibleDeviceModelIds: readonly string[] | null | undefined,
): DeviceFitState {
  const hydrated = useMyDevicesHydrated();
  const devices = useMyDevices();
  const device = hydrated ? (devices[0] ?? null) : null;
  return {
    hydrated,
    device,
    devices: hydrated ? devices : EMPTY_DEVICES,
    verdict: getDeviceFit(compatibleDeviceModelIds, device),
  };
}
