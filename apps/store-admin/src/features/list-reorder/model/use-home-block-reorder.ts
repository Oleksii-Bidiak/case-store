"use client";

/**
 * Homepage block reorder — ONE LIST (plan 186, TASK-662).
 *
 * The «Головна» screen draws every block, hidden and scheduled ones included, in page
 * order. `PATCH /admin/home-blocks/reorder` takes the COMPLETE ordered id list and 409s
 * (`REORDER_STALE`) on anything less, so the items handed in must be the whole admin
 * list — the screen has no filter or search over it on purpose (a local filter over a
 * draggable list is the pair that broke wave 175).
 *
 * The reorder response is the refreshed list; the lifecycle writes it into the
 * unparameterised `GET /admin/home-blocks` key the screen reads.
 */

import { useCallback, useMemo } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  getAdminHomeBlockControllerFindAllQueryKey,
  getAdminHomeBlockControllerFindAllQueryOptions,
  useAdminHomeBlockControllerReorder,
  type AdminHomeBlockListResponse,
  type HomeBlockEntity,
  type ReorderHomeBlocksDto,
} from "@/shared/api";
import { homeBlockLabel, sortHomeBlocks } from "@/entities/home-block";
import {
  flatReorderStrings,
  isFlatReorderConflict,
  orderedIdsIfChanged,
  type ReorderLifecycleApi,
} from "@/shared/lib/list-reorder";
import type { TreeItem } from "@/shared/lib/sortable-tree";
import { useUndoToastReorder } from "./use-undo-toast-reorder";

/**
 * The key of the UNPARAMETERISED list read — it must match the widget's
 * `useAdminHomeBlockControllerFindAll()` call exactly (no arguments).
 */
const HOME_BLOCKS_KEY = getAdminHomeBlockControllerFindAllQueryKey();

/** Every block, in page order, as reorder items (the label names it in toasts and announcements). */
export function homeBlocksToItems(
  blocks: readonly HomeBlockEntity[],
): TreeItem[] {
  return sortHomeBlocks(blocks).map((block) => ({
    id: block.id,
    parentId: null,
    label: homeBlockLabel(block),
  }));
}

/** The PATCH body: the FULL new order, or `null` when nothing moved. */
export function homeBlockReorderPayload(
  from: TreeItem[],
  to: TreeItem[],
): ReorderHomeBlocksDto | null {
  const orderedIds = orderedIdsIfChanged(from, to);
  return orderedIds === null ? null : { orderedIds };
}

export interface UseHomeBlockReorderOptions {
  /** Every block, from the UNFILTERED admin list. */
  items: TreeItem[];
  onFocusRow?: (id: string) => void;
}

export function useHomeBlockReorder({
  items,
  onFocusRow,
}: UseHomeBlockReorderOptions): ReorderLifecycleApi {
  const queryClient = useQueryClient();
  const reorder = useAdminHomeBlockControllerReorder();
  const { mutate: rawMutate } = reorder;

  const mutate = useCallback(
    (
      payload: ReorderHomeBlocksDto,
      callbacks: {
        onSuccess: (response: AdminHomeBlockListResponse) => void;
        onError: (error: unknown) => void;
        onSettled: () => void;
      },
    ) => {
      rawMutate({ data: payload }, callbacks);
    },
    [rawMutate],
  );

  /** `fetchQuery` writes the fresh list into the cache AND resolves with it. */
  const refetch = useCallback(
    () =>
      queryClient
        .fetchQuery(getAdminHomeBlockControllerFindAllQueryOptions())
        .then((fresh: AdminHomeBlockListResponse) =>
          homeBlocksToItems(fresh?.data ?? []),
        ),
    [queryClient],
  );

  const strings = useMemo(() => flatReorderStrings, []);

  return useUndoToastReorder<ReorderHomeBlocksDto, AdminHomeBlockListResponse>({
    resource: "home-blocks",
    items,
    toPayload: homeBlockReorderPayload,
    mutate,
    isPending: reorder.isPending,
    queryKey: HOME_BLOCKS_KEY,
    refetch,
    strings,
    onFocusRow,
    isConflict: isFlatReorderConflict,
  });
}
