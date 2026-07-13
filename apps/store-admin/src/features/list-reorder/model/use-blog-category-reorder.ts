"use client";

/**
 * Blog-category reorder (TASK-295) — ONE global bucket, so the payload is a bare
 * `{ orderedIds }` naming every category in the list.
 */

import { useCallback, useMemo } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  getAdminBlogControllerFindCategoriesQueryKey,
  getAdminBlogControllerFindCategoriesQueryOptions,
  useAdminBlogControllerReorderCategories,
  type BlogCategoryEntity,
  type BlogCategoryListResponse,
  type ReorderBlogCategoriesDto,
} from "@/entities/blog";
import {
  flatReorderStrings,
  isFlatReorderConflict,
  orderedIdsIfChanged,
  useReorderLifecycle,
  type ReorderLifecycleApi,
} from "@/shared/lib/list-reorder";
import type { TreeItem } from "@/shared/lib/sortable-tree";

const CATEGORIES_KEY = getAdminBlogControllerFindCategoriesQueryKey();

export function blogCategoriesToItems(
  categories: BlogCategoryEntity[],
): TreeItem[] {
  return categories.map((category) => ({
    id: category.id,
    parentId: null,
    label: category.name,
  }));
}

export interface UseBlogCategoryReorderOptions {
  /** The COMPLETE category list (a filtered one would 409). */
  items: TreeItem[];
  onFocusRow?: (id: string) => void;
}

export function useBlogCategoryReorder({
  items,
  onFocusRow,
}: UseBlogCategoryReorderOptions): ReorderLifecycleApi {
  const queryClient = useQueryClient();
  const reorder = useAdminBlogControllerReorderCategories();
  const { mutate: rawMutate } = reorder;

  const toPayload = useCallback(
    (from: TreeItem[], to: TreeItem[]): ReorderBlogCategoriesDto | null => {
      const orderedIds = orderedIdsIfChanged(from, to);
      return orderedIds === null ? null : { orderedIds };
    },
    [],
  );

  const mutate = useCallback(
    (
      payload: ReorderBlogCategoriesDto,
      callbacks: {
        onSuccess: (response: BlogCategoryListResponse) => void;
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
        .fetchQuery(getAdminBlogControllerFindCategoriesQueryOptions())
        .then((fresh: BlogCategoryListResponse) =>
          blogCategoriesToItems(fresh?.data ?? []),
        ),
    [queryClient],
  );

  const strings = useMemo(() => flatReorderStrings, []);

  return useReorderLifecycle<
    ReorderBlogCategoriesDto,
    BlogCategoryListResponse
  >({
    resource: "blog-categories",
    items,
    toPayload,
    mutate,
    isPending: reorder.isPending,
    queryKey: CATEGORIES_KEY,
    refetch,
    strings,
    onFocusRow,
    isConflict: isFlatReorderConflict,
  });
}
