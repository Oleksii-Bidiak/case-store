"use client";

/**
 * Carousel reorder — ONE PLACEMENT BUCKET (TASK-428).
 *
 * A carousel's `sortOrder` is only meaningful inside its own placement (the tab order
 * within HOME_TABS, the rail order within HOME_RAILS), so the unit of reordering is a
 * placement, not "the carousels". The hook is therefore instantiated PER SECTION
 * (`widgets/carousel-list` renders one section per placement, because hooks cannot be
 * called in a loop), and `placement` travels in the PATCH body. Structurally the banner
 * adapter, and for the same reasons.
 *
 * The payload must name EVERY carousel in the placement or the server 409s, so the items
 * handed in must come from the UNFILTERED, UNPAGINATED admin list, narrowed to this
 * placement — never from a list a UI filter has already thinned out.
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
  type CarouselEntityPlacement,
  type ReorderCarouselsDto,
} from "@/shared/api";
import {
  flatReorderStrings,
  isFlatReorderConflict,
  orderedIdsIfChanged,
  useReorderLifecycle,
  type ReorderLifecycleApi,
} from "@/shared/lib/list-reorder";
import type { TreeItem } from "@/shared/lib/sortable-tree";

/**
 * The key of the UNPARAMETERISED list read — the one the grids render and the one the
 * reorder response is written into. It must match the widget's
 * `useAdminCarouselControllerFindAll()` call exactly (no arguments).
 */
const CAROUSELS_KEY = getAdminCarouselControllerFindAllQueryKey();

/** Carousels of one placement, in list order, as reorder items. */
export function carouselsToItems(
  carousels: CarouselEntity[],
  placement: CarouselEntityPlacement,
): TreeItem[] {
  return carousels
    .filter((carousel) => carousel.placement === placement)
    .map((carousel) => ({
      id: carousel.id,
      parentId: null,
      label: carousel.title,
    }));
}

export interface UseCarouselReorderOptions {
  placement: CarouselEntityPlacement;
  /** This placement's carousels, from the UNFILTERED admin list. */
  items: TreeItem[];
  onFocusRow?: (id: string) => void;
}

export function useCarouselReorder({
  placement,
  items,
  onFocusRow,
}: UseCarouselReorderOptions): ReorderLifecycleApi {
  const queryClient = useQueryClient();
  const reorder = useAdminCarouselControllerReorder();
  const { mutate: rawMutate } = reorder;

  const toPayload = useCallback(
    (from: TreeItem[], to: TreeItem[]): ReorderCarouselsDto | null => {
      const orderedIds = orderedIdsIfChanged(from, to);
      return orderedIds === null ? null : { placement, orderedIds };
    },
    [placement],
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

  /**
   * `fetchQuery` writes the fresh list into the cache AND resolves with it; it is then
   * narrowed back to THIS placement, because the lifecycle orders one bucket.
   */
  const refetch = useCallback(
    () =>
      queryClient
        .fetchQuery(getAdminCarouselControllerFindAllQueryOptions())
        .then((fresh: AdminCarouselListResponse) =>
          carouselsToItems(fresh?.data ?? [], placement),
        ),
    [placement, queryClient],
  );

  const strings = useMemo(() => flatReorderStrings, []);

  return useReorderLifecycle<ReorderCarouselsDto, AdminCarouselListResponse>({
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
