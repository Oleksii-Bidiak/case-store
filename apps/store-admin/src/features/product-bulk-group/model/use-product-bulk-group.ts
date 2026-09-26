"use client";

import { useQueryClient } from "@tanstack/react-query";
import { getProductControllerAdminFindAllQueryKey } from "@/entities/product";
// Straight from the generated client: the hook has exactly one caller, so
// re-exporting it through the product entity would add a hop and nothing else.
import { useProductControllerSetGroupMany } from "@/shared/api";
import { useBulkStatus } from "@/features/bulk-status";
import { dict } from "@/shared/config";

const t = dict.products.bulk;

export interface UseProductBulkGroupOptions {
  /** Called after the server confirms the write — the caller clears its selection. */
  onSuccess?: () => void;
}

export interface ProductBulkGroupApi {
  /** `groupId: null` takes the products out of whatever group they are in. */
  setGroup: (ids: string[], groupId: string | null) => void;
  isPending: boolean;
}

/**
 * Bulk «Перемістити до групи» for the selected products (TASK-423), built on
 * `useBulkStatus` (TASK-812): no optimistic write, and the announcement reports
 * what the DATABASE wrote.
 *
 * Unlike deactivation this does NOT confirm first: regrouping changes no
 * visibility, nothing leaves the storefront, and it is reversible (the product
 * list offers «Скасувати» right after, TASK-837) — so a prompt would be noise on
 * the one bulk action an operator performs repeatedly while assembling a
 * colour family.
 *
 * Moved here from `widgets/product-list/model` (TASK-812): a write against the
 * product API is a business interaction, which is what `features/` is for.
 */
export function useProductBulkGroup({
  onSuccess,
}: UseProductBulkGroupOptions = {}): ProductBulkGroupApi {
  const queryClient = useQueryClient();
  const mutation = useProductControllerSetGroupMany();

  const { run, isPending } = useBulkStatus({
    mutation,
    toVariables: (ids, groupId: string | null) => ({ data: { ids, groupId } }),
    announceSaving: (count) => t.announceGroupSaving(count),
    announceDone: (response) => t.announceGroupDone(response.data.updatedCount),
    announceFailed: t.announceGroupFailed,
    onWritten: () => {
      void queryClient.invalidateQueries({
        queryKey: getProductControllerAdminFindAllQueryKey(),
      });
    },
    onSuccess,
  });

  return { setGroup: run, isPending };
}
