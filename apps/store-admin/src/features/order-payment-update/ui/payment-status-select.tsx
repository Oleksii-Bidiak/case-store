"use client";

import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  getAdminOrderControllerFindAllQueryKey,
  getAdminOrderControllerFindByIdQueryKey,
  getAdminOrderControllerGetAllowedTransitionsQueryKey,
  getAdminOrderControllerGetHistoryQueryKey,
  OrderEntityPaymentStatus,
  paymentStatusLabel,
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

interface PaymentStatusSelectProps {
  orderId: string;
  currentPaymentStatus: string;
}

const PAYMENT_STATUSES = Object.values(OrderEntityPaymentStatus);

/**
 * Payment-status control for the order detail page (TASK-151).
 *
 * Independent of the order-status control: setting the payment status here never
 * changes the order status. Lists all {@link OrderEntityPaymentStatus} values
 * except the order's current one.
 *
 * On success it invalidates EVERY view derived from this order, and the
 * allowed-transitions query is the one that matters most (TASK-400). That query
 * carries the optimistic-lock token the status picker sends back as
 * `expectedUpdatedAt`, and a payment write bumps `updatedAt` like any other
 * write. While it stayed cached, the operator's next status change was decided
 * against a version of the order that no longer existed and the server refused
 * it as stale — an operator alone in a single tab was told somebody else had
 * just changed the order, when the somebody else was their own previous click.
 */
export function PaymentStatusSelect({
  orderId,
  currentPaymentStatus,
}: PaymentStatusSelectProps) {
  const queryClient = useQueryClient();
  const updatePaymentStatus = useAdminOrderControllerUpdatePaymentStatus();

  const options = PAYMENT_STATUSES.filter(
    (status) => status !== currentPaymentStatus,
  );

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
        onError: () => {
          toast.error(dict.orderStatus.paymentToastFailed);
        },
      },
    );
  };

  return (
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
        {options.map((status) => (
          <SelectItem key={status} value={status}>
            {paymentStatusLabel(status)}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
