"use client";

import { useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  getAdminOrderControllerFindAllQueryKey,
  getAdminOrderControllerFindByIdQueryKey,
  getAdminOrderControllerGetAllowedTransitionsQueryKey,
  getAdminOrderControllerGetHistoryQueryKey,
  useAdminOrderControllerReturnParcelToStock,
} from "@/entities/order";
import { toast } from "@/shared/ui/toast";
import { dict } from "@/shared/config";
import { parcelReturnErrorMessage } from "./parcel-return-error";

export interface OrderParcelReturnApi {
  /** Credit the refused parcel back to stock — call only after confirming. */
  returnParcel: () => void;
  isPending: boolean;
}

/**
 * «Посилку повернуто на склад» (TASK-2575) — the write half.
 *
 * A cancelled order that had shipped does not give its stock back by itself:
 * the goods are somewhere between the buyer and the warehouse. Once the refused
 * parcel is physically back, the operator says so, and the server credits each
 * line once (`restockedAt`). Nothing is optimistic — the order, its history and
 * its lock token are re-read after the server confirms, and the list too.
 */
export function useOrderParcelReturn(orderId: string): OrderParcelReturnApi {
  const queryClient = useQueryClient();
  const mutation = useAdminOrderControllerReturnParcelToStock();
  const { mutate, isPending } = mutation;

  const refreshOrder = useCallback(() => {
    for (const queryKey of [
      getAdminOrderControllerFindByIdQueryKey(orderId),
      getAdminOrderControllerGetHistoryQueryKey(orderId),
      // The write bumps the order's version — the status control's lock token.
      getAdminOrderControllerGetAllowedTransitionsQueryKey(orderId),
    ]) {
      void queryClient.invalidateQueries({ queryKey });
    }
  }, [orderId, queryClient]);

  const returnParcel = useCallback(() => {
    if (isPending) return;
    mutate(
      { orderId },
      {
        onSuccess: () => {
          refreshOrder();
          void queryClient.invalidateQueries({
            queryKey: getAdminOrderControllerFindAllQueryKey(),
          });
          toast.success(dict.orders.parcelReturnDone);
        },
        onError: (error) => {
          const { message, conflict } = parcelReturnErrorMessage(error);
          // The card showed an order the server no longer agrees with.
          if (conflict) refreshOrder();
          toast.error(message);
        },
      },
    );
  }, [isPending, mutate, orderId, queryClient, refreshOrder]);

  return { returnParcel, isPending };
}
