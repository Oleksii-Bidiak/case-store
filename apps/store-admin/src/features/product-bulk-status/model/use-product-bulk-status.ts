"use client";

import type { ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  getProductControllerAdminFindAllQueryKey,
  useProductControllerSetStatusMany,
} from "@/entities/product";
import { useBulkStatus } from "@/features/bulk-status";
import { dict } from "@/shared/config";

const t = dict.products.bulk;

export interface UseProductBulkStatusOptions {
  /** Called after the server confirms the write — the caller clears its selection. */
  onSuccess?: () => void;
}

export interface ProductBulkStatusApi {
  setStatus: (ids: string[], isActive: boolean) => void;
  isPending: boolean;
  /** The deactivate prompt (TASK-812) — render once in the caller's JSX. */
  confirmDialog: ReactNode;
}

/**
 * Bulk activate / deactivate the selected products (TASK-355).
 *
 * A thin wrapper over `useBulkStatus` (TASK-812), which owns the rules this hook
 * used to spell out itself: deactivating asks first (hiding N products from the
 * storefront in one click is the action an operator regrets; cancel ⇒ zero
 * requests), activating does not, and nothing is written optimistically.
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
  const mutation = useProductControllerSetStatusMany();

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
    announceSaving: (count) => t.announceSaving(count),
    announceDone: (response, _ids, isActive) =>
      t.announceDone(response.data.updatedCount, isActive),
    announceFailed: t.announceFailed,
    onWritten: () => {
      void queryClient.invalidateQueries({
        queryKey: getProductControllerAdminFindAllQueryKey(),
      });
    },
    onSuccess,
  });

  return { setStatus: run, isPending, confirmDialog };
}
