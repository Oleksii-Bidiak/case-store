"use client";

import { useDeviceControllerFindModels } from "@/shared/api/generated/devices/devices";
import {
  DeviceModelSort,
  type DeviceControllerFindModelsParams,
  type DeviceModelListItemEntity,
} from "@/shared/api/generated/models";

/**
 * The full active model list in popularity order — ONE request whose cache
 * entry the device picker, the homepage picker and search share (same params
 * → same React Query key). `limit: 200` is the API maximum; the catalogue is
 * well under it (plan SД3: ≤ 200 models, matched on the client).
 */
export const DEVICE_MODEL_CATALOG_PARAMS = {
  sort: DeviceModelSort.popular,
  limit: 200,
} as const satisfies DeviceControllerFindModelsParams;

/** Device models change on admin edits only — ten minutes fresh is plenty. */
const CATALOG_STALE_TIME_MS = 10 * 60 * 1000;

const EMPTY_MODELS: readonly DeviceModelListItemEntity[] = Object.freeze([]);

export interface DeviceModelCatalog {
  /** Popular first (most compatible products), then by name. */
  models: readonly DeviceModelListItemEntity[];
  /** True only while the first fetch is in flight (not when disabled). */
  isLoading: boolean;
  isError: boolean;
  retry: () => void;
}

export function useDeviceModelCatalog({
  enabled = true,
}: { enabled?: boolean } = {}): DeviceModelCatalog {
  const query = useDeviceControllerFindModels(DEVICE_MODEL_CATALOG_PARAMS, {
    query: { enabled, staleTime: CATALOG_STALE_TIME_MS },
  });
  return {
    models: query.data?.data ?? EMPTY_MODELS,
    isLoading: query.isLoading,
    isError: query.isError,
    retry: () => void query.refetch(),
  };
}
