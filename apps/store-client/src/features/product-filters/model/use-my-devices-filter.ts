"use client";

import { useQueries } from "@tanstack/react-query";
import {
  getProductControllerFindAllQueryOptions,
  type ProductControllerFindAllParams,
} from "@/entities/product";
import {
  useMyDevices,
  useMyDevicesHydrated,
  type MyDevice,
} from "@/entities/my-devices";
import {
  resolveMyDevicesFilter,
  type MyDevicesFilterState,
} from "./my-devices-filter";

export interface MyDevicesFilter {
  /**
   * `false` on the server and in the hydration render: an empty list does not
   * mean "no devices" yet, so callers reserve space instead of drawing the
   * no-device state (the saved list is localStorage-only — plan SД3).
   */
  hydrated: boolean;
  /** Saved devices, most recent first (the first is active). */
  devices: readonly MyDevice[];
  state: MyDevicesFilterState;
}

/** The panel's mode for the current `?device=` against the saved devices. */
export function useMyDevicesFilter(
  deviceParam: string | null | undefined,
): MyDevicesFilter {
  const hydrated = useMyDevicesHydrated();
  const saved = useMyDevices();
  const devices = hydrated ? saved : [];
  return {
    hydrated,
    devices,
    state: resolveMyDevicesFilter(deviceParam, devices),
  };
}

/**
 * How many products the CURRENT listing (category, brand, price, facets…)
 * would show with `device=` set to each value — the counts beside the panel's
 * radios and the empty state's «other devices» chips. One `limit: 1` request
 * per value; only `meta.total` is read. `undefined` while in flight.
 */
export function useDeviceFilterCounts(
  params: ProductControllerFindAllParams,
  deviceValues: readonly string[],
  enabled: boolean,
): (number | undefined)[] {
  const results = useQueries({
    queries: deviceValues.map((device) => ({
      ...getProductControllerFindAllQueryOptions({
        ...params,
        device,
        page: 1,
        limit: 1,
      }),
      enabled,
    })),
  });
  return results.map((result) => result.data?.meta?.total);
}
