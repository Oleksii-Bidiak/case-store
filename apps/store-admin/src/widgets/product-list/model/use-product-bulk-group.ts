"use client";

import { useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { getProductControllerAdminFindAllQueryKey } from "@/entities/product";
// Straight from the generated client, as `admin-product-table.tsx` already does
// for `useCategoryControllerGetRootCategories`: the hook has exactly one caller,
// so re-exporting it through the product entity would add a hop and nothing else.
import { useProductControllerSetGroupMany } from "@/shared/api";
import { useAnnouncer } from "@/shared/ui";
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
 * Bulk «Перемістити до групи» for the selected products (TASK-423).
 *
 * Modelled on the sibling `useProductBulkStatus` (TASK-355), including the two
 * decisions that look like caution and are:
 *
 * - **No optimistic write.** The list is invalidated only after the server
 *   confirms, so a failed batch leaves the table showing the true state rather
 *   than a rollback the operator has to interpret.
 * - **Announce what the DATABASE wrote**, not what was asked for. The two can
 *   only differ when something went wrong, which is exactly when the operator
 *   needs the real number.
 *
 * Unlike deactivation this does NOT confirm first: regrouping changes no
 * visibility, nothing leaves the storefront, and it is reversible by running the
 * action again — so a prompt would be noise on the one bulk action an operator
 * performs repeatedly while assembling a colour family.
 *
 * ── Why it lives in the widget's own `model/` ────────────────────────────────
 * It has exactly one caller — the product list's bulk bar — and it exists to
 * serve that table's selection. Promoting it to `features/` would buy a slice
 * boundary nothing crosses.
 */
export function useProductBulkGroup({
  onSuccess,
}: UseProductBulkGroupOptions = {}): ProductBulkGroupApi {
  const queryClient = useQueryClient();
  const { announcePolite, announceAssertive } = useAnnouncer();
  const mutation = useProductControllerSetGroupMany();

  const setGroup = useCallback(
    (ids: string[], groupId: string | null) => {
      if (mutation.isPending || ids.length === 0) return;

      announcePolite(t.announceGroupSaving(ids.length));

      mutation.mutate(
        { data: { ids, groupId } },
        {
          onSuccess: (response) => {
            void queryClient.invalidateQueries({
              queryKey: getProductControllerAdminFindAllQueryKey(),
            });
            announcePolite(t.announceGroupDone(response.data.updatedCount));
            onSuccess?.();
          },
          onError: () => {
            announceAssertive(t.announceGroupFailed);
          },
        },
      );
    },
    [announceAssertive, announcePolite, mutation, onSuccess, queryClient],
  );

  return { setGroup, isPending: mutation.isPending };
}
