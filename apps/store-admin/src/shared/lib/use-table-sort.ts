"use client";

import { useCallback } from "react";
import type { ReadonlyURLSearchParams } from "next/navigation";

export type SortOrder = "asc" | "desc";

export interface TableSort {
  sortBy: string;
  sortOrder: SortOrder;
  /** Toggle order on the active field, or switch to a new field (desc first). */
  onSort: (field: string) => void;
}

/**
 * useTableSort — drives admin-table column sorting from the URL (TASK-147).
 *
 * `sortBy`/`sortOrder` live in the query string so sort survives refresh and is
 * shareable. Writes go through the caller's `updateParams` — in every table
 * that is `useUrlParams`, which merges the patch into the params already in the
 * URL — and always reset `page` so the user lands on page 1 after re-sorting.
 *
 * Not barrel-exported from `shared/lib/index.ts` — like `use-debounced-callback`,
 * it is a `"use client"` hook and must be imported directly from this file.
 */
export function useTableSort(
  searchParams: ReadonlyURLSearchParams,
  updateParams: (next: Record<string, string | undefined>) => void,
  defaultSortBy = "createdAt",
  defaultSortOrder: SortOrder = "desc",
): TableSort {
  const sortBy = searchParams.get("sortBy") ?? defaultSortBy;
  const rawOrder = searchParams.get("sortOrder");
  const sortOrder: SortOrder =
    rawOrder === "asc"
      ? "asc"
      : rawOrder === "desc"
        ? "desc"
        : defaultSortOrder;

  const onSort = useCallback(
    (field: string) => {
      const nextOrder: SortOrder =
        field === sortBy ? (sortOrder === "asc" ? "desc" : "asc") : "desc";
      updateParams({ sortBy: field, sortOrder: nextOrder, page: undefined });
    },
    [sortBy, sortOrder, updateParams],
  );

  return { sortBy, sortOrder, onSort };
}
