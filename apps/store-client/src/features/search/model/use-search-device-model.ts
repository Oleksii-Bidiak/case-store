"use client";

import { useMemo } from "react";

import {
  useDeviceModelCatalog,
  type DeviceModelListItemEntity,
} from "@/entities/device";

import {
  classifyDeviceQuery,
  type DeviceQueryMatch,
} from "./classify-device-query";

export type SearchDeviceModel = DeviceModelListItemEntity;
export type SearchDeviceMatch = DeviceQueryMatch<SearchDeviceModel>;

/**
 * The device model a search query names, or `null` (TASK-2069). Runs the
 * shared classifier over the full active model list — the one cached
 * `GET /device-models` request the device picker uses too. `null` while the
 * list loads or fails: the model block simply does not appear (no skeleton —
 * the rest of the search works without it).
 */
export function useSearchDeviceModel(
  query: string,
  { enabled = true }: { enabled?: boolean } = {},
): SearchDeviceMatch | null {
  const { models } = useDeviceModelCatalog({ enabled });
  return useMemo(
    () => (enabled ? classifyDeviceQuery(query.trim(), models) : null),
    [enabled, query, models],
  );
}
