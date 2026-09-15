"use client";

import { useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { getProductControllerAdminFindAllQueryKey } from "@/entities/product";
// Straight from the generated client, as the sibling `use-product-bulk-group`
// already does: the hook has exactly one caller, so re-exporting it through the
// product entity would add a hop and nothing else.
import { useProductControllerSetColorMany } from "@/shared/api";
import { useAnnouncer } from "@/shared/ui";
import { dict } from "@/shared/config";

const t = dict.products.bulk;

export interface UseProductBulkColorOptions {
  /** Called after the server confirms the write — the caller clears its selection. */
  onSuccess?: () => void;
}

export interface ProductBulkColorApi {
  /** `color: null` removes the colour from the selected products. */
  setColor: (ids: string[], color: string | null) => void;
  isPending: boolean;
}

/**
 * Bulk «Задати колір» for the selected products (TASK-487, owner decision B-10).
 *
 * Colour is the strongest facet in accessories and the one nobody filled in: it
 * arrives as a VARIANT AXIS, and the product form edits one position at a time —
 * so making a colour family of nine filterable cost nine full form saves. The
 * endpoint behind this writes both halves at once (the axis JSON and the `color`
 * spec the catalogue filter reads); see `ProductService.setColorMany`.
 *
 * Modelled on the sibling `useProductBulkGroup` (TASK-423), including the two
 * decisions that look like caution and are:
 *
 * - **No optimistic write.** The list is invalidated only after the server
 *   confirms, so a failed batch leaves the table showing the true state rather
 *   than a rollback the operator has to interpret.
 * - **Announce what the DATABASE wrote**, not what was asked for. The two can
 *   only differ when something went wrong, which is exactly when the operator
 *   needs the real number.
 *
 * Setting a colour does NOT confirm first — nothing leaves the storefront and
 * running the action again fixes a typo. CLEARING does confirm: it removes the
 * products from the colour filter, which is a disappearance the operator did not
 * necessarily picture when they emptied a text box.
 */
export function useProductBulkColor({
  onSuccess,
}: UseProductBulkColorOptions = {}): ProductBulkColorApi {
  const queryClient = useQueryClient();
  const { announcePolite, announceAssertive } = useAnnouncer();
  const mutation = useProductControllerSetColorMany();

  const setColor = useCallback(
    (ids: string[], color: string | null) => {
      if (mutation.isPending || ids.length === 0) return;

      if (color === null && !window.confirm(t.colorClearConfirm(ids.length))) {
        return;
      }

      announcePolite(t.announceColorSaving(ids.length));

      mutation.mutate(
        { data: { ids, color } },
        {
          onSuccess: (response) => {
            void queryClient.invalidateQueries({
              queryKey: getProductControllerAdminFindAllQueryKey(),
            });
            announcePolite(
              color === null
                ? t.announceColorCleared(response.data.updatedCount)
                : t.announceColorDone(response.data.updatedCount),
            );
            onSuccess?.();
          },
          onError: () => {
            announceAssertive(t.announceColorFailed);
          },
        },
      );
    },
    [announceAssertive, announcePolite, mutation, onSuccess, queryClient],
  );

  return { setColor, isPending: mutation.isPending };
}
