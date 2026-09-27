"use client";

import type { ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  getAdminCategoryControllerFindAllWithProductCountQueryKey,
  getCategoryControllerGetAdminTreeQueryKey,
  useAdminCategoryControllerSetStatusMany,
} from "@/entities/category";
import { useBulkStatus } from "@/features/bulk-status";
import { dict } from "@/shared/config";

const t = dict.categories.tree.bulk;

export interface UseCategoryBulkStatusOptions {
  /** Called after the server confirms the write — the caller clears its selection. */
  onSuccess?: () => void;
}

export interface CategoryBulkStatusApi {
  setStatus: (ids: string[], isActive: boolean) => void;
  isPending: boolean;
  /** The deactivate prompt (TASK-812) — render once in the caller's JSX. */
  confirmDialog: ReactNode;
}

/**
 * Bulk activate / deactivate the selected categories (TASK-293).
 *
 * NO CASCADE (owner decision): the PATCH writes `isActive` on exactly the selected
 * ids. Descendants keep their own flag — though a deactivated parent still hides its
 * whole branch from the storefront, which is why the deactivate path is gated by a
 * blast-radius AlertDialog (TASK-812, via `useBulkStatus`), exactly as the per-row
 * toggle is (`features/category-status-toggle`). Cancel ⇒ ZERO mutation calls.
 *
 * The endpoint returns the FULL refreshed admin tree, so the response is written
 * straight into the tree query's cache — one round-trip, no refetch, and no window in
 * which the grid shows the pre-write tree. The paginated admin list is a different
 * query and is merely invalidated. On error the tree cache was never overwritten
 * optimistically, so there is nothing to roll back.
 */
export function useCategoryBulkStatus({
  onSuccess,
}: UseCategoryBulkStatusOptions = {}): CategoryBulkStatusApi {
  const queryClient = useQueryClient();
  const mutation = useAdminCategoryControllerSetStatusMany();

  const { run, isPending, confirmDialog } = useBulkStatus({
    mutation,
    toVariables: (ids, isActive: boolean) => ({ data: { ids, isActive } }),
    confirmFor: (ids, isActive) =>
      isActive
        ? null
        : {
            description: t.deactivateConfirm(ids.length),
            confirmLabel: t.deactivate(ids.length),
            destructive: true,
          },
    announceSaving: (count) => t.announce.saving(count),
    announceDone: (_response, ids, isActive) =>
      t.announce.done(ids.length, isActive),
    announceFailed: t.announce.failed,
    onWritten: (response) => {
      queryClient.setQueryData(
        getCategoryControllerGetAdminTreeQueryKey(),
        response,
      );
      void queryClient.invalidateQueries({
        queryKey: getAdminCategoryControllerFindAllWithProductCountQueryKey(),
      });
    },
    onSuccess,
  });

  return { setStatus: run, isPending, confirmDialog };
}
