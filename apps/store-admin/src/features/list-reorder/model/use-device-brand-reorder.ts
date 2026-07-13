"use client";

/**
 * Device-brand reorder (TASK-295) — ONE global bucket, so the payload is a bare
 * `{ orderedIds }` naming every brand in the list.
 */

import { useCallback, useMemo } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  getAdminDeviceControllerFindBrandsQueryKey,
  getAdminDeviceControllerFindBrandsQueryOptions,
  useAdminDeviceControllerReorderBrands,
  type AdminDeviceBrandListResponse,
  type DeviceBrandEntity,
  type ReorderDeviceBrandsDto,
} from "@/entities/device";
import {
  flatReorderStrings,
  isFlatReorderConflict,
  orderedIdsIfChanged,
  useReorderLifecycle,
  type ReorderLifecycleApi,
} from "@/shared/lib/list-reorder";
import type { TreeItem } from "@/shared/lib/sortable-tree";

const BRANDS_KEY = getAdminDeviceControllerFindBrandsQueryKey();

export function deviceBrandsToItems(brands: DeviceBrandEntity[]): TreeItem[] {
  return brands.map((brand) => ({
    id: brand.id,
    parentId: null,
    label: brand.name,
  }));
}

export interface UseDeviceBrandReorderOptions {
  /** The COMPLETE brand list (a filtered one would 409). */
  items: TreeItem[];
  onFocusRow?: (id: string) => void;
}

export function useDeviceBrandReorder({
  items,
  onFocusRow,
}: UseDeviceBrandReorderOptions): ReorderLifecycleApi {
  const queryClient = useQueryClient();
  const reorder = useAdminDeviceControllerReorderBrands();
  const { mutate: rawMutate } = reorder;

  const toPayload = useCallback(
    (from: TreeItem[], to: TreeItem[]): ReorderDeviceBrandsDto | null => {
      const orderedIds = orderedIdsIfChanged(from, to);
      return orderedIds === null ? null : { orderedIds };
    },
    [],
  );

  const mutate = useCallback(
    (
      payload: ReorderDeviceBrandsDto,
      callbacks: {
        onSuccess: (response: AdminDeviceBrandListResponse) => void;
        onError: (error: unknown) => void;
        onSettled: () => void;
      },
    ) => {
      rawMutate({ data: payload }, callbacks);
    },
    [rawMutate],
  );

  const refetch = useCallback(
    () =>
      queryClient
        .fetchQuery(getAdminDeviceControllerFindBrandsQueryOptions())
        .then((fresh: AdminDeviceBrandListResponse) =>
          deviceBrandsToItems(fresh?.data ?? []),
        ),
    [queryClient],
  );

  const strings = useMemo(() => flatReorderStrings, []);

  return useReorderLifecycle<
    ReorderDeviceBrandsDto,
    AdminDeviceBrandListResponse
  >({
    resource: "device-brands",
    items,
    toPayload,
    mutate,
    isPending: reorder.isPending,
    queryKey: BRANDS_KEY,
    refetch,
    strings,
    onFocusRow,
    isConflict: isFlatReorderConflict,
  });
}
