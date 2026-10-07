"use client";

/**
 * Pickup-point reorder (TASK-645) — ONE global bucket, so the payload is a bare
 * `{ orderedIds }` naming every point, inactive ones included: the index
 * becomes `sortOrder`, which is the order the checkout lists the points in.
 *
 * The admin list is never filtered or paged (`GET /api/admin/pickup-points`
 * returns every point), so the items handed in are always the complete list —
 * a partial one would 409 as a lost update. Mirrors `use-faq-reorder.ts`,
 * «Скасувати» toast included.
 */

import { useCallback, useMemo } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  getListAdminPickupPointsQueryKey,
  getListAdminPickupPointsQueryOptions,
  useReorderPickupPoints,
  type AdminPickupPointDto,
  type AdminPickupPointListResponse,
  type ReorderPickupPointsDto,
} from "@/entities/delivery";
import {
  flatReorderStrings,
  isFlatReorderConflict,
  orderedIdsIfChanged,
  type ReorderLifecycleApi,
} from "@/shared/lib/list-reorder";
import type { TreeItem } from "@/shared/lib/sortable-tree";
import { useUndoToastReorder } from "./use-undo-toast-reorder";

/**
 * The key of the list read — the one the grid renders, the preview counts
 * from, and the reorder response is written into.
 */
const PICKUP_POINTS_KEY = getListAdminPickupPointsQueryKey();

/** Pickup points, in list order, as reorder items. */
export function pickupPointsToItems(points: AdminPickupPointDto[]): TreeItem[] {
  return points.map((point) => ({
    id: point.id,
    parentId: null,
    label: point.name,
  }));
}

export interface UsePickupPointReorderOptions {
  /** The COMPLETE point list. */
  items: TreeItem[];
  onFocusRow?: (id: string) => void;
}

export function usePickupPointReorder({
  items,
  onFocusRow,
}: UsePickupPointReorderOptions): ReorderLifecycleApi {
  const queryClient = useQueryClient();
  const reorder = useReorderPickupPoints();
  const { mutate: rawMutate } = reorder;

  const toPayload = useCallback(
    (from: TreeItem[], to: TreeItem[]): ReorderPickupPointsDto | null => {
      const orderedIds = orderedIdsIfChanged(from, to);
      return orderedIds === null ? null : { orderedIds };
    },
    [],
  );

  const mutate = useCallback(
    (
      payload: ReorderPickupPointsDto,
      callbacks: {
        onSuccess: (response: AdminPickupPointListResponse) => void;
        onError: (error: unknown) => void;
        onSettled: () => void;
      },
    ) => {
      rawMutate({ data: payload }, callbacks);
    },
    [rawMutate],
  );

  // `fetchQuery` resolves with the fresh list AND writes it into the cache.
  const refetch = useCallback(
    () =>
      queryClient
        .fetchQuery(getListAdminPickupPointsQueryOptions())
        .then((fresh: AdminPickupPointListResponse) =>
          pickupPointsToItems(fresh?.data ?? []),
        ),
    [queryClient],
  );

  const strings = useMemo(() => flatReorderStrings, []);

  return useUndoToastReorder<
    ReorderPickupPointsDto,
    AdminPickupPointListResponse
  >({
    resource: "pickup-points",
    items,
    toPayload,
    mutate,
    isPending: reorder.isPending,
    queryKey: PICKUP_POINTS_KEY,
    refetch,
    strings,
    onFocusRow,
    isConflict: isFlatReorderConflict,
  });
}
