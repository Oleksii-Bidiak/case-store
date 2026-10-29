"use client";

/**
 * Carousel reorder — ONE LIST (TASK-428; a single global list since TASK-660).
 *
 * Until plan 186 carousels had two placement buckets (the «Популярне» tabs and the
 * standalone rails). `Carousel.placement` is gone: where a carousel shows on the
 * homepage now belongs to the homepage blocks, and this order is only the admin
 * list's. The payload must name EVERY carousel or the server 409s, so the items
 * handed in must come from the UNFILTERED, UNPAGINATED admin list — never from a
 * list a UI filter has already thinned out.
 *
 * The generated hooks come from `@/shared/api` for the reason spelled out in
 * `use-faq-reorder.ts` — TASK-428 does not own the entity barrels.
 */

import { useCallback, useMemo } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  getAdminCarouselControllerFindAllQueryKey,
  getAdminCarouselControllerFindAllQueryOptions,
  useAdminCarouselControllerReorder,
  type AdminCarouselListResponse,
  type CarouselEntity,
  type ReorderCarouselsDto,
} from "@/shared/api";
import {
  flatReorderStrings,
  isFlatReorderConflict,
  orderedIdsIfChanged,
  type ReorderLifecycleApi,
} from "@/shared/lib/list-reorder";
import type { TreeItem } from "@/shared/lib/sortable-tree";
import { useUndoToastReorder } from "./use-undo-toast-reorder";

/**
 * The key of the UNPARAMETERISED list read — the one the grid renders and the one the
 * reorder response is written into. It must match the widget's
 * `useAdminCarouselControllerFindAll()` call exactly (no arguments).
 */
const CAROUSELS_KEY = getAdminCarouselControllerFindAllQueryKey();

/** The carousels, in list order, as reorder items. */
export function carouselsToItems(carousels: CarouselEntity[]): TreeItem[] {
  return carousels.map((carousel) => ({
    id: carousel.id,
    parentId: null,
    label: carousel.title,
  }));
}

export interface UseCarouselReorderOptions {
  /** Every carousel, from the UNFILTERED admin list. */
  items: TreeItem[];
  onFocusRow?: (id: string) => void;
}

export function useCarouselReorder({
  items,
  onFocusRow,
}: UseCarouselReorderOptions): ReorderLifecycleApi {
  const queryClient = useQueryClient();
  const reorder = useAdminCarouselControllerReorder();
  const { mutate: rawMutate } = reorder;

  const toPayload = useCallback(
    (from: TreeItem[], to: TreeItem[]): ReorderCarouselsDto | null => {
      const orderedIds = orderedIdsIfChanged(from, to);
      return orderedIds === null ? null : { orderedIds };
    },
    [],
  );

  const mutate = useCallback(
    (
      payload: ReorderCarouselsDto,
      callbacks: {
        onSuccess: (response: AdminCarouselListResponse) => void;
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
        .fetchQuery(getAdminCarouselControllerFindAllQueryOptions())
        .then((fresh: AdminCarouselListResponse) =>
          carouselsToItems(fresh?.data ?? []),
        ),
    [queryClient],
  );

  const strings = useMemo(() => flatReorderStrings, []);

  return useUndoToastReorder<ReorderCarouselsDto, AdminCarouselListResponse>({
    resource: "carousels",
    items,
    toPayload,
    mutate,
    isPending: reorder.isPending,
    queryKey: CAROUSELS_KEY,
    refetch,
    strings,
    onFocusRow,
    isConflict: isFlatReorderConflict,
  });
}
