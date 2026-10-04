"use client";

import { useCallback, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "@/shared/ui/toast";
import { useConfirmDialog } from "@/shared/ui";
import { dict } from "@/shared/config";
import {
  getAdminGetDiscountQueryKey,
  getAdminListDiscountsQueryKey,
  useAdminDeactivateDiscount,
  useAdminUpdateDiscount,
  type DiscountEntity,
} from "@/entities/discount";

const d = dict.discounts;

export interface DiscountStatusApi {
  /** «Вимкнути…» — asks with the consequences first (ПК6), then soft-deactivates. */
  requestDeactivate: (discount: DiscountEntity) => void;
  /** «Увімкнути» — the safe direction, one step, no prompt. */
  activate: (discount: DiscountEntity) => void;
  isPending: boolean;
  /** Render once in the caller's JSX. */
  confirmDialog: ReactNode;
}

/**
 * The on/off pair of a promo code, for the registry's «⋯» (DiscountsProposal
 * ПК1/ПК6, TASK-1085).
 *
 * It replaces the status cell's asymmetric «Деактивувати» button / «Неактивний»
 * badge. Nothing was dropped and both directions now live in one place:
 *
 * - OFF is the same soft-deactivate the button sent (`DELETE
 *   /admin/discounts/:id`), now behind an AlertDialog that says what happens to
 *   carts and orders — the button switched a live code off on one click.
 * - ON was only reachable through the edit form's checkbox; it is the same
 *   `PATCH { isActive: true }` that form sends, offered from the list too.
 *
 * Both endpoints sit behind `discounts:write`; the caller gates the menu items.
 */
export function useDiscountStatus(): DiscountStatusApi {
  const queryClient = useQueryClient();
  const deactivate = useAdminDeactivateDiscount();
  const update = useAdminUpdateDiscount();
  const { confirm, confirmDialog } = useConfirmDialog();

  const isPending = deactivate.isPending || update.isPending;

  const invalidate = useCallback(
    (id: string) => {
      // Prefix match: every page, search and view counter of the list.
      void queryClient.invalidateQueries({
        queryKey: getAdminListDiscountsQueryKey(),
      });
      void queryClient.invalidateQueries({
        queryKey: getAdminGetDiscountQueryKey(id),
      });
    },
    [queryClient],
  );

  const requestDeactivate = useCallback(
    (discount: DiscountEntity) => {
      void (async () => {
        const confirmed = await confirm({
          title: d.disableTitle(discount.code),
          description: d.disableDescription,
          confirmLabel: d.disableConfirm,
        });
        if (!confirmed) return;
        deactivate.mutate(
          { id: discount.id },
          {
            onSuccess: () => {
              invalidate(discount.id);
              toast.success(d.toastDeactivated);
            },
            onError: () => toast.error(d.toastDeactivateFailed),
          },
        );
      })();
    },
    [confirm, deactivate, invalidate],
  );

  const activate = useCallback(
    (discount: DiscountEntity) => {
      update.mutate(
        { id: discount.id, data: { isActive: true } },
        {
          onSuccess: () => {
            invalidate(discount.id);
            toast.success(d.toastActivated);
          },
          onError: () => toast.error(d.toastActivateFailed),
        },
      );
    },
    [invalidate, update],
  );

  return { requestDeactivate, activate, isPending, confirmDialog };
}
