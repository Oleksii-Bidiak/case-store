"use client";

/**
 * Static-page reorder (TASK-428) — ONE global bucket on the wire, so the payload is a
 * bare `{ orderedIds }` naming every page.
 *
 * The payload must name EVERY page or the server 409s it as a lost update, so the items
 * handed in must come from the UNFILTERED, UNPAGINATED admin list. `widgets/page-list`
 * therefore stopped paging: before TASK-428 the admin endpoint could not even RETURN the
 * complete list (its query DTO inherited `page = 1` / `limit = 20` initializers), so a
 * drag on page 1 of a long list would have sent a 20-id payload describing a list of 42.
 *
 * TASK-1990 — the order that MEANS something is per hub: `/legal` renders only the
 * legal pages, `/info` only the info ones, so a drag across kinds in «Усі» changed
 * nothing an operator could see. `scope` names the slice (a kind view's ids): the
 * lifecycle then runs over that slice alone — positions, announcements and the undo
 * toast count within it — and `toPayload` writes the reordered slice back into the
 * slots its rows held in the global order (`mergeSliceOrder`), so the wire payload
 * still names every page and the API is unchanged. The undo stays exact:
 * `toPayload(next, prev)` merges into the SAME full order the move did.
 *
 * The generated hooks come from `@/shared/api` for the reason spelled out in
 * `use-faq-reorder.ts` — TASK-428 does not own the entity barrels.
 */

import { useCallback, useMemo } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  getAdminPageControllerFindAllQueryKey,
  getAdminPageControllerFindAllQueryOptions,
  useAdminPageControllerReorder,
  type AdminPageListResponse,
  type PageEntity,
  type ReorderPagesDto,
} from "@/shared/api";
import {
  flatReorderStrings,
  isFlatReorderConflict,
  mergeSliceOrder,
  orderedIdsIfChanged,
  type ReorderLifecycleApi,
} from "@/shared/lib/list-reorder";
import type { TreeItem } from "@/shared/lib/sortable-tree";
import { useUndoToastReorder } from "./use-undo-toast-reorder";

/**
 * The key of the UNPARAMETERISED list read — the one the grid renders and the one the
 * reorder response is written into. It must match the widget's
 * `useAdminPageControllerFindAll()` call exactly (no arguments).
 */
const PAGES_KEY = getAdminPageControllerFindAllQueryKey();

/** Pages, in list order, as reorder items. */
export function pagesToItems(pages: PageEntity[]): TreeItem[] {
  return pages.map((page) => ({
    id: page.id,
    parentId: null,
    label: page.title,
  }));
}

export interface UsePageReorderOptions {
  /** The COMPLETE page list (a filtered or paged one would 409). */
  items: TreeItem[];
  /**
   * TASK-1990 — reorder only these rows (a kind view's ids). The returned
   * `items` are that slice; every payload still names every page. Omitted ⇒
   * the whole list is the slice.
   */
  scope?: ReadonlySet<string>;
  onFocusRow?: (id: string) => void;
}

export function usePageReorder({
  items,
  scope,
  onFocusRow,
}: UsePageReorderOptions): ReorderLifecycleApi {
  const queryClient = useQueryClient();
  const reorder = useAdminPageControllerReorder();
  const { mutate: rawMutate } = reorder;

  const slice = useMemo(
    () => (scope ? items.filter((item) => scope.has(item.id)) : items),
    [items, scope],
  );

  const toPayload = useCallback(
    (from: TreeItem[], to: TreeItem[]): ReorderPagesDto | null => {
      if (orderedIdsIfChanged(from, to) === null) return null;
      const orderedIds = mergeSliceOrder(
        items.map((item) => item.id),
        to.map((item) => item.id),
      );
      return orderedIds === null ? null : { orderedIds };
    },
    [items],
  );

  const mutate = useCallback(
    (
      payload: ReorderPagesDto,
      callbacks: {
        onSuccess: (response: AdminPageListResponse) => void;
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
        .fetchQuery(getAdminPageControllerFindAllQueryOptions())
        .then((fresh: AdminPageListResponse) => {
          const all = pagesToItems(fresh?.data ?? []);
          // The conflict recovery speaks positions within the slice on screen.
          return scope ? all.filter((item) => scope.has(item.id)) : all;
        }),
    [queryClient, scope],
  );

  const strings = useMemo(() => flatReorderStrings, []);

  return useUndoToastReorder<ReorderPagesDto, AdminPageListResponse>({
    resource: "pages",
    items: slice,
    toPayload,
    mutate,
    isPending: reorder.isPending,
    queryKey: PAGES_KEY,
    refetch,
    strings,
    onFocusRow,
    isConflict: isFlatReorderConflict,
  });
}
