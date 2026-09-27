"use client";

import type { ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { getProductControllerAdminFindAllQueryKey } from "@/entities/product";
// Straight from the generated client, as the sibling `use-product-bulk-group`
// does: the hook has exactly one caller, so re-exporting it through the product
// entity would add a hop and nothing else.
import { useProductControllerSetColorMany } from "@/shared/api";
import { useBulkStatus } from "@/features/bulk-status";
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
  /** The clear-colour prompt (TASK-812) — render once in the caller's JSX. */
  confirmDialog: ReactNode;
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
 * Built on `useBulkStatus` (TASK-812): no optimistic write, and the announcement
 * reports what the DATABASE wrote.
 *
 * Setting a colour does NOT confirm first — nothing leaves the storefront and
 * running the action again fixes a typo. CLEARING does confirm (an AlertDialog
 * since TASK-812, `window.confirm` before): it removes the products from the
 * colour filter, which is a disappearance the operator did not necessarily
 * picture when they emptied a text box.
 *
 * Moved here from `widgets/product-list/model` (TASK-812): a write against the
 * product API is a business interaction, which is what `features/` is for.
 */
export function useProductBulkColor({
  onSuccess,
}: UseProductBulkColorOptions = {}): ProductBulkColorApi {
  const queryClient = useQueryClient();
  const mutation = useProductControllerSetColorMany();

  const { run, isPending, confirmDialog } = useBulkStatus({
    mutation,
    toVariables: (ids, color: string | null) => ({ data: { ids, color } }),
    confirmFor: (ids, color) =>
      color === null
        ? {
            description: t.colorClearConfirm(ids.length),
            confirmLabel: t.colorClear,
            destructive: true,
          }
        : null,
    announceSaving: (count) => t.announceColorSaving(count),
    announceDone: (response, _ids, color) =>
      color === null
        ? t.announceColorCleared(response.data.updatedCount)
        : t.announceColorDone(response.data.updatedCount),
    announceFailed: t.announceColorFailed,
    onWritten: () => {
      void queryClient.invalidateQueries({
        queryKey: getProductControllerAdminFindAllQueryKey(),
      });
    },
    onSuccess,
  });

  return { setColor: run, isPending, confirmDialog };
}
