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
  CATALOG_MY_DEVICES_DEFAULT,
  catalogDeviceParam,
  resolveMyDevicesFilter,
  type MyDevicesFilterDefault,
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
 * The catalogue's `device=` with the «Мої пристрої» default applied (Д3-2
 * Catalog §11/§20): the URL's own, nothing after `compat=off`, else the
 * active device. The saved list is localStorage-only, so the server render and
 * the hydration render see no devices and list what the URL says — the server
 * prefetch's own query; the default lands on the first client render after.
 */
export function useCatalogDeviceParam(
  urlDevice: string | null | undefined,
  compat: string | null | undefined,
  defaults: Readonly<MyDevicesFilterDefault> = CATALOG_MY_DEVICES_DEFAULT,
): { device: string | undefined; hasDevices: boolean } {
  const hydrated = useMyDevicesHydrated();
  const saved = useMyDevices();
  const devices = hydrated ? saved : [];
  return {
    device: catalogDeviceParam(urlDevice, compat, devices, defaults),
    hasDevices: devices.length > 0,
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
