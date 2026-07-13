"use client";

/**
 * Banner reorder — ONE PLACEMENT BUCKET (TASK-295).
 *
 * A banner's `sortOrder` is only meaningful inside its own placement, so the unit
 * of reordering is a placement, not "the banners". The hook is therefore
 * instantiated PER SECTION (`widgets/banner-list` renders one
 * `BannerPlacementSection` per placement, because hooks cannot be called in a
 * loop), and `placement` travels in the PATCH body.
 *
 * The payload must name EVERY banner in the placement or the server 409s, so the
 * items handed in must come from the UNFILTERED admin banner list, narrowed to
 * this placement — never from a list a UI filter has already thinned out.
 */

import { useCallback, useMemo } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  getAdminBannerControllerFindAllQueryKey,
  getAdminBannerControllerFindAllQueryOptions,
  useAdminBannerControllerReorder,
  type AdminBannerListResponse,
  type BannerEntity,
  type BannerEntityPlacement,
  type ReorderBannersDto,
} from "@/entities/banner";
import {
  flatReorderStrings,
  isFlatReorderConflict,
  orderedIdsIfChanged,
  useReorderLifecycle,
  type ReorderLifecycleApi,
} from "@/shared/lib/list-reorder";
import type { TreeItem } from "@/shared/lib/sortable-tree";

const BANNERS_KEY = getAdminBannerControllerFindAllQueryKey();

/** Banners of one placement, in list order, as reorder items. */
export function bannersToItems(
  banners: BannerEntity[],
  placement: BannerEntityPlacement,
): TreeItem[] {
  return banners
    .filter((banner) => banner.placement === placement)
    .map((banner) => ({ id: banner.id, parentId: null, label: banner.title }));
}

export interface UseBannerReorderOptions {
  placement: BannerEntityPlacement;
  /** This placement's banners, from the UNFILTERED admin list. */
  items: TreeItem[];
  onFocusRow?: (id: string) => void;
}

export function useBannerReorder({
  placement,
  items,
  onFocusRow,
}: UseBannerReorderOptions): ReorderLifecycleApi {
  const queryClient = useQueryClient();
  const reorder = useAdminBannerControllerReorder();
  const { mutate: rawMutate } = reorder;

  const toPayload = useCallback(
    (from: TreeItem[], to: TreeItem[]): ReorderBannersDto | null => {
      const orderedIds = orderedIdsIfChanged(from, to);
      return orderedIds === null ? null : { placement, orderedIds };
    },
    [placement],
  );

  const mutate = useCallback(
    (
      payload: ReorderBannersDto,
      callbacks: {
        onSuccess: (response: AdminBannerListResponse) => void;
        onError: (error: unknown) => void;
        onSettled: () => void;
      },
    ) => {
      rawMutate({ data: payload }, callbacks);
    },
    [rawMutate],
  );

  /**
   * `fetchQuery`, not `refetchQueries`: the latter only touches queries that
   * already have an observer. `fetchQuery` resolves with the fresh list AND
   * writes it into the cache, which is what every mounted observer re-renders
   * from. It is then narrowed back to THIS placement.
   */
  const refetch = useCallback(
    () =>
      queryClient
        .fetchQuery(getAdminBannerControllerFindAllQueryOptions())
        .then((fresh: AdminBannerListResponse) =>
          bannersToItems(fresh?.data ?? [], placement),
        ),
    [placement, queryClient],
  );

  const strings = useMemo(() => flatReorderStrings, []);

  return useReorderLifecycle<ReorderBannersDto, AdminBannerListResponse>({
    resource: "banners",
    items,
    toPayload,
    mutate,
    isPending: reorder.isPending,
    queryKey: BANNERS_KEY,
    refetch,
    strings,
    onFocusRow,
    isConflict: isFlatReorderConflict,
  });
}
