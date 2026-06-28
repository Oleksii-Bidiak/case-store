"use client";

import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  getAdminOrderControllerFindAllQueryKey,
  getAdminOrderControllerFindByIdQueryKey,
  orderStatusLabel,
  useAdminOrderControllerUpdateStatus,
  type UpdateOrderStatusDto,
} from "@/entities/order";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/ui";
import { dict } from "@/shared/config";
import { getAllowedTransitions } from "../model/transitions";

interface OrderStatusSelectProps {
  orderId: string;
  currentStatus: string;
}

/**
 * Status control for the order detail page.
 *
 * TASK-151: the admin has full manual control — every status except the order's
 * current one is selectable (see {@link getAllowedTransitions}). On success it
 * invalidates both the admin order list and this order's detail query so every
 * view reflects the new status.
 */
export function OrderStatusSelect({
  orderId,
  currentStatus,
}: OrderStatusSelectProps) {
  const queryClient = useQueryClient();
  const updateStatus = useAdminOrderControllerUpdateStatus();

  // TASK-151: admin has full manual control — every status except the current
  // one is an available target, so this list is never empty (no terminal guard).
  const allowed = getAllowedTransitions(currentStatus);

  const handleChange = (value: string) => {
    updateStatus.mutate(
      {
        orderId,
        data: { status: value as UpdateOrderStatusDto["status"] },
      },
      {
        onSuccess: () => {
          void queryClient.invalidateQueries({
            queryKey: getAdminOrderControllerFindAllQueryKey(),
          });
          void queryClient.invalidateQueries({
            queryKey: getAdminOrderControllerFindByIdQueryKey(orderId),
          });
          toast.success(dict.orderStatus.toastUpdated(orderStatusLabel(value)));
        },
        onError: () => {
          toast.error(dict.orderStatus.toastFailed);
        },
      },
    );
  };

  return (
    <Select
      value=""
      onValueChange={handleChange}
      disabled={updateStatus.isPending}
    >
      <SelectTrigger className="w-56" aria-label={dict.orderStatus.updateAria}>
        <SelectValue placeholder={dict.orderStatus.changeStatus} />
      </SelectTrigger>
      <SelectContent>
        {allowed.map((status) => (
          <SelectItem key={status} value={status}>
            {orderStatusLabel(status)}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
