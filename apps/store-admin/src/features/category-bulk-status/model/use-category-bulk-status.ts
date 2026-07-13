"use client";

import { useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  getAdminCategoryControllerFindAllWithProductCountQueryKey,
  getCategoryControllerGetAdminTreeQueryKey,
  useAdminCategoryControllerSetStatusMany,
} from "@/entities/category";
import { useAnnouncer } from "@/shared/ui";
import { dict } from "@/shared/config";

const t = dict.categories.tree.bulk;

export interface UseCategoryBulkStatusOptions {
  /** Called after the server confirms the write — the caller clears its selection. */
  onSuccess?: () => void;
}

export interface CategoryBulkStatusApi {
  setStatus: (ids: string[], isActive: boolean) => void;
  isPending: boolean;
}

/**
 * Bulk activate / deactivate the selected categories (TASK-293).
 *
 * NO CASCADE (owner decision): the PATCH writes `isActive` on exactly the selected
 * ids. Descendants keep their own flag — though a deactivated parent still hides its
 * whole branch from the storefront, which is why the deactivate path is gated by a
 * blast-radius `window.confirm`, exactly as the per-row toggle is
 * (`features/category-status-toggle`). Cancel ⇒ ZERO mutation calls.
 *
 * The endpoint returns the FULL refreshed admin tree, so the response is written
 * straight into the tree query's cache — one round-trip, no refetch, and no window in
 * which the grid shows the pre-write tree. The paginated admin list is a different
 * query and is merely invalidated.
 */
export function useCategoryBulkStatus({
  onSuccess,
}: UseCategoryBulkStatusOptions = {}): CategoryBulkStatusApi {
  const queryClient = useQueryClient();
  const { announcePolite, announceAssertive } = useAnnouncer();
  const mutation = useAdminCategoryControllerSetStatusMany();

  const setStatus = useCallback(
    (ids: string[], isActive: boolean) => {
      if (mutation.isPending || ids.length === 0) return;

      if (!isActive && !window.confirm(t.deactivateConfirm(ids.length))) {
        return;
      }

      announcePolite(t.announce.saving(ids.length));

      mutation.mutate(
        { data: { ids, isActive } },
        {
          onSuccess: (response) => {
            queryClient.setQueryData(
              getCategoryControllerGetAdminTreeQueryKey(),
              response,
            );
            void queryClient.invalidateQueries({
              queryKey:
                getAdminCategoryControllerFindAllWithProductCountQueryKey(),
            });
            announcePolite(t.announce.done(ids.length, isActive));
            onSuccess?.();
          },
          onError: () => {
            // The tree cache was never overwritten optimistically, so there is
            // nothing to roll back — the grid still shows the true server state.
            announceAssertive(t.announce.failed);
          },
        },
      );
    },
    [announceAssertive, announcePolite, mutation, onSuccess, queryClient],
  );

  return { setStatus, isPending: mutation.isPending };
}
