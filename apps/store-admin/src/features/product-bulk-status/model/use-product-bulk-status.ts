"use client";

import { useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  getProductControllerAdminFindAllQueryKey,
  useProductControllerSetStatusMany,
} from "@/entities/product";
import { useAnnouncer } from "@/shared/ui";
import { dict } from "@/shared/config";

const t = dict.products.bulk;

export interface UseProductBulkStatusOptions {
  /** Called after the server confirms the write — the caller clears its selection. */
  onSuccess?: () => void;
}

export interface ProductBulkStatusApi {
  setStatus: (ids: string[], isActive: boolean) => void;
  isPending: boolean;
}

/**
 * Bulk activate / deactivate the selected products (TASK-355).
 *
 * Modelled on `features/category-bulk-status` (TASK-293), including the parts
 * that look like caution and are:
 *
 * - **Deactivating asks first.** Hiding N products from the storefront in one
 *   click is exactly the action an operator regrets, and the count is the whole
 *   point of the prompt. Cancel ⇒ ZERO mutation calls. Activating does not ask:
 *   making things visible is not the destructive direction.
 * - **No optimistic write.** The list is invalidated only after the server
 *   confirms, so a failed batch leaves the table showing the true state rather
 *   than a rollback the operator has to interpret.
 *
 * Unlike the category endpoint this one returns a count, not the refreshed
 * collection — the product list is paginated and filtered, so echoing it back
 * would be a page the caller may not even be looking at any more. Invalidate
 * and let the table refetch its own page.
 */
export function useProductBulkStatus({
  onSuccess,
}: UseProductBulkStatusOptions = {}): ProductBulkStatusApi {
  const queryClient = useQueryClient();
  const { announcePolite, announceAssertive } = useAnnouncer();
  const mutation = useProductControllerSetStatusMany();

  const setStatus = useCallback(
    (ids: string[], isActive: boolean) => {
      if (mutation.isPending || ids.length === 0) return;

      if (!isActive && !window.confirm(t.deactivateConfirm(ids.length))) {
        return;
      }

      announcePolite(t.announceSaving(ids.length));

      mutation.mutate(
        { data: { ids, isActive } },
        {
          onSuccess: (response) => {
            void queryClient.invalidateQueries({
              queryKey: getProductControllerAdminFindAllQueryKey(),
            });
            // Announce what the DATABASE wrote, not what was asked for. They
            // can only differ if something went wrong, and that is precisely
            // when the operator needs the real number.
            announcePolite(
              t.announceDone(response.data.updatedCount, isActive),
            );
            onSuccess?.();
          },
          onError: () => {
            announceAssertive(t.announceFailed);
          },
        },
      );
    },
    [announceAssertive, announcePolite, mutation, onSuccess, queryClient],
  );

  return { setStatus, isPending: mutation.isPending };
}
