"use client";

/**
 * FAQ reorder (TASK-428) — ONE global bucket, so the payload is a bare `{ orderedIds }`
 * naming every question in the list.
 *
 * The payload must name EVERY item or the server 409s it as a lost update, so the items
 * handed in must come from the UNFILTERED, UNPAGINATED admin list — never from a list a
 * search or a pager has already thinned out. That is why `widgets/faq-list` dropped its
 * server paging and made its search local + reorder-locking.
 *
 * The generated hooks are imported from `@/shared/api` rather than `@/entities/faq`:
 * TASK-428 does not own that entity barrel, and a feature importing the shared layer
 * directly is the established fallback here (`features/carousel-form`,
 * `features/product-publish-panel`). Re-exporting them from the barrel is a follow-up for
 * the entity slice's owner — the symbols are identical either way, so the query key below
 * is the same object the widget's list query uses.
 */

import { useCallback, useMemo } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  getAdminFaqControllerFindAllQueryKey,
  getAdminFaqControllerFindAllQueryOptions,
  useAdminFaqControllerReorder,
  type AdminFaqListResponse,
  type FaqItemEntity,
  type ReorderFaqItemsDto,
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
 * The key of the UNPARAMETERISED list read — the one the grid renders and the one the
 * reorder response is written into. It must match the widget's
 * `useAdminFaqControllerFindAll()` call exactly (no arguments), or the server's refreshed
 * list would land in a cache entry nothing observes.
 */
const FAQ_KEY = getAdminFaqControllerFindAllQueryKey();

/** FAQ items, in list order, as reorder items. */
export function faqItemsToItems(items: FaqItemEntity[]): TreeItem[] {
  return items.map((item) => ({
    id: item.id,
    parentId: null,
    label: item.question,
  }));
}

export interface UseFaqReorderOptions {
  /** The COMPLETE FAQ list (a filtered or paged one would 409). */
  items: TreeItem[];
  onFocusRow?: (id: string) => void;
}

export function useFaqReorder({
  items,
  onFocusRow,
}: UseFaqReorderOptions): ReorderLifecycleApi {
  const queryClient = useQueryClient();
  const reorder = useAdminFaqControllerReorder();
  const { mutate: rawMutate } = reorder;

  const toPayload = useCallback(
    (from: TreeItem[], to: TreeItem[]): ReorderFaqItemsDto | null => {
      const orderedIds = orderedIdsIfChanged(from, to);
      return orderedIds === null ? null : { orderedIds };
    },
    [],
  );

  const mutate = useCallback(
    (
      payload: ReorderFaqItemsDto,
      callbacks: {
        onSuccess: (response: AdminFaqListResponse) => void;
        onError: (error: unknown) => void;
        onSettled: () => void;
      },
    ) => {
      rawMutate({ data: payload }, callbacks);
    },
    [rawMutate],
  );

  /**
   * `fetchQuery`, not `refetchQueries`: the latter only touches queries that already have
   * an observer. `fetchQuery` resolves with the fresh list AND writes it into the cache,
   * which is what every mounted observer re-renders from.
   */
  const refetch = useCallback(
    () =>
      queryClient
        .fetchQuery(getAdminFaqControllerFindAllQueryOptions())
        .then((fresh: AdminFaqListResponse) =>
          faqItemsToItems(fresh?.data ?? []),
        ),
    [queryClient],
  );

  const strings = useMemo(() => flatReorderStrings, []);

  return useReorderLifecycle<ReorderFaqItemsDto, AdminFaqListResponse>({
    resource: "faq",
    items,
    toPayload,
    mutate,
    isPending: reorder.isPending,
    queryKey: FAQ_KEY,
    refetch,
    strings,
    onFocusRow,
    isConflict: isFlatReorderConflict,
  });
}
