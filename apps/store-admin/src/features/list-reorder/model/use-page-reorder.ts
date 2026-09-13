"use client";

/**
 * Static-page reorder (TASK-428) — ONE global bucket (the `/legal` hub renders the pages
 * in one sequence), so the payload is a bare `{ orderedIds }` naming every page.
 *
 * The payload must name EVERY page or the server 409s it as a lost update, so the items
 * handed in must come from the UNFILTERED, UNPAGINATED admin list. `widgets/page-list`
 * therefore stopped paging: before TASK-428 the admin endpoint could not even RETURN the
 * complete list (its query DTO inherited `page = 1` / `limit = 20` initializers), so a
 * drag on page 1 of a long list would have sent a 20-id payload describing a list of 42.
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
  orderedIdsIfChanged,
  useReorderLifecycle,
  type ReorderLifecycleApi,
} from "@/shared/lib/list-reorder";
import type { TreeItem } from "@/shared/lib/sortable-tree";

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
  onFocusRow?: (id: string) => void;
}

export function usePageReorder({
  items,
  onFocusRow,
}: UsePageReorderOptions): ReorderLifecycleApi {
  const queryClient = useQueryClient();
  const reorder = useAdminPageControllerReorder();
  const { mutate: rawMutate } = reorder;

  const toPayload = useCallback(
    (from: TreeItem[], to: TreeItem[]): ReorderPagesDto | null => {
      const orderedIds = orderedIdsIfChanged(from, to);
      return orderedIds === null ? null : { orderedIds };
    },
    [],
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
        .then((fresh: AdminPageListResponse) =>
          pagesToItems(fresh?.data ?? []),
        ),
    [queryClient],
  );

  const strings = useMemo(() => flatReorderStrings, []);

  return useReorderLifecycle<ReorderPagesDto, AdminPageListResponse>({
    resource: "pages",
    items,
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
