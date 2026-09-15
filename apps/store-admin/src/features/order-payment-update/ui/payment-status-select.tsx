"use client";

import { useQueryClient } from "@tanstack/react-query";
import { toast } from "@/shared/ui/toast";
import {
  getAdminOrderControllerFindAllQueryKey,
  getAdminOrderControllerFindByIdQueryKey,
  getAdminOrderControllerGetAllowedPaymentTransitionsQueryKey,
  getAdminOrderControllerGetAllowedTransitionsQueryKey,
  getAdminOrderControllerGetHistoryQueryKey,
  paymentStatusLabel,
  useAdminOrderControllerGetAllowedPaymentTransitions,
  useAdminOrderControllerUpdatePaymentStatus,
  type UpdateOrderPaymentStatusDto,
} from "@/entities/order";
import { getAdminDashboardControllerGetNeedsActionQueryKey } from "@/entities/dashboard";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/ui";
import { dict } from "@/shared/config";
import { toPaymentTransitionOptions } from "../model/payment-transitions";
import {
  paymentConflictMessage,
  type ApiErrorLike,
} from "../model/payment-conflict";

interface PaymentStatusSelectProps {
  orderId: string;
  /**
   * No longer read (TASK-431): the current status and the legal targets both
   * come from the server now. Kept on the interface so the single call site in
   * `order-detail-view.tsx` — a file this wave hands to other agents — does not
   * have to change in the same breath as this component. Drop both together
   * later.
   */
  currentPaymentStatus?: string;
}

/**
 * Payment-status control for the order detail page (TASK-151, TASK-431).
 *
 * It used to offer every payment status except the current one, which is another
 * way of saying it offered moves that could not happen: "Кошти повернено" on a
 * delivered order, "Оплачено" on one already refunded. TASK-431 gave
 * `paymentStatus` a state machine and an endpoint that publishes what is legal
 * right now, so this picker asks instead of guessing — exactly what
 * `OrderStatusSelect` already does for the order status.
 *
 * Two things follow, and both are visible to the operator:
 *
 *  - The dropdown can be SHORT, or empty. A refunded order offers nothing, and a
 *    delivered paid one offers only a PARTIAL refund — the full refund is absent
 *    on purpose, and the hint under the control says why rather than leaving them
 *    to wonder.
 *  - A refused write is explained in the operator's own language. The server
 *    distinguishes "that move is impossible" from "cancel the order first", and
 *    so does the toast, because those have different next actions.
 *
 * On success it invalidates EVERY view derived from this order, and the two
 * allowed-transitions queries are the ones that matter most (TASK-400). They
 * carry the optimistic-lock token the status picker sends back as
 * `expectedUpdatedAt`, and a payment write bumps `updatedAt` like any other
 * write. While they stayed cached, the operator's next status change was decided
 * against a version of the order that no longer existed and the server refused it
 * as stale — an operator alone in a single tab was told somebody else had just
 * changed the order, when the somebody else was their own previous click.
 */
export function PaymentStatusSelect({ orderId }: PaymentStatusSelectProps) {
  const queryClient = useQueryClient();
  const transitions =
    useAdminOrderControllerGetAllowedPaymentTransitions(orderId);
  const updatePaymentStatus = useAdminOrderControllerUpdatePaymentStatus();

  const { allowed } = toPaymentTransitionOptions(transitions.data);

  const handleChange = (value: string) => {
    updatePaymentStatus.mutate(
      {
        orderId,
        data: {
          paymentStatus: value as UpdateOrderPaymentStatusDto["paymentStatus"],
        },
      },
      {
        onSuccess: () => {
          void queryClient.invalidateQueries({
            queryKey: getAdminOrderControllerFindAllQueryKey(),
          });
          void queryClient.invalidateQueries({
            queryKey: getAdminOrderControllerFindByIdQueryKey(orderId),
          });
          // TASK-400: the lock token moved with this write — refetch it, or the
          // operator's next status change is refused as stale by their own edit.
          void queryClient.invalidateQueries({
            queryKey:
              getAdminOrderControllerGetAllowedTransitionsQueryKey(orderId),
          });
          // TASK-431: and this control's own option list, which the write has
          // just changed — PAID becomes "partially refunded / refunded", and so on.
          void queryClient.invalidateQueries({
            queryKey:
              getAdminOrderControllerGetAllowedPaymentTransitionsQueryKey(
                orderId,
              ),
          });
          // A payment change DOES write an audit row (`updatePaymentStatus` in
          // `order.repository.ts`, changeType PAYMENT_STATUS), so the timeline
          // rendered on this page is now out of date too.
          void queryClient.invalidateQueries({
            queryKey: getAdminOrderControllerGetHistoryQueryKey(orderId),
          });
          // TASK-248: marking an order paid/unpaid moves it in/out of the
          // unpaid-in-transit counter — refresh the needs-action widget + badges.
          void queryClient.invalidateQueries({
            queryKey: getAdminDashboardControllerGetNeedsActionQueryKey(),
          });
          toast.success(
            dict.orderStatus.paymentToastUpdated(paymentStatusLabel(value)),
          );
        },
        onError: (error) => {
          const message = paymentConflictMessage(error as ApiErrorLike);
          if (message) {
            // Refetch the options either way: after a refused move they are
            // simply wrong, and the order card beside them with it.
            void queryClient.invalidateQueries({
              queryKey:
                getAdminOrderControllerGetAllowedPaymentTransitionsQueryKey(
                  orderId,
                ),
            });
            void queryClient.invalidateQueries({
              queryKey: getAdminOrderControllerFindByIdQueryKey(orderId),
            });
            toast.error(message);
            return;
          }
          toast.error(dict.orderStatus.paymentToastFailed);
        },
      },
    );
  };

  if (transitions.isLoading) {
    return (
      <p className="text-sm text-muted-foreground">
        {dict.orderStatus.paymentTransitionsLoading}
      </p>
    );
  }

  if (transitions.isError) {
    return (
      <p role="alert" className="text-sm text-destructive">
        {dict.orderStatus.paymentTransitionsLoadError}
      </p>
    );
  }

  if (allowed.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        {dict.orderStatus.noPaymentTransitions}
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <Select
        value=""
        onValueChange={handleChange}
        disabled={updatePaymentStatus.isPending}
      >
        <SelectTrigger
          className="w-56"
          aria-label={dict.orderStatus.paymentUpdateAria}
        >
          <SelectValue placeholder={dict.orderStatus.changePaymentStatus} />
        </SelectTrigger>
        <SelectContent>
          {allowed.map((status) => (
            <SelectItem key={status} value={status}>
              {paymentStatusLabel(status)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <p className="text-xs text-muted-foreground">
        {dict.orderStatus.paymentTransitionsHint}
      </p>
    </div>
  );
}
