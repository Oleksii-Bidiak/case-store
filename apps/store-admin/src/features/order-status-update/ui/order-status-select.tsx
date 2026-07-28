"use client";

import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  getAdminOrderControllerFindAllQueryKey,
  getAdminOrderControllerFindByIdQueryKey,
  getAdminOrderControllerGetAllowedTransitionsQueryKey,
  getAdminOrderControllerGetHistoryQueryKey,
  orderStatusLabel,
  useAdminOrderControllerGetAllowedTransitions,
  useAdminOrderControllerUpdateStatus,
  type UpdateOrderStatusDto,
} from "@/entities/order";
import { getAdminDashboardControllerGetNeedsActionQueryKey } from "@/entities/dashboard";
import {
  Button,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/ui";
import { dict } from "@/shared/config";
import { toTransitionOptions } from "../model/transitions";
import {
  orderConflictMessage,
  requiresReload,
  type ApiErrorLike,
} from "../model/order-conflict";

interface OrderStatusSelectProps {
  orderId: string;
}

/**
 * Status control for the order detail page (TASK-332).
 *
 * Offers exactly the moves the server says are legal, and hands back the lock
 * token it received with them. Three things follow from that, and each one is a
 * behaviour an operator can see:
 *
 *  - The dropdown can be SHORT. `DELIVERED` offers two options, not six. That is
 *    the point: the previous version listed every status and let the operator
 *    find out from a failure which ones were real.
 *  - A refused write is explained, not swallowed. A 409 says which of the two
 *    things happened — the move is impossible, or somebody else got there first
 *    — because the operator's next action differs (`pick again` vs `reload`).
 *  - The conflict notice STAYS on screen. It is rendered as a live region rather
 *    than only a toast, because "your change did not save" is not something to
 *    show for four seconds and then take away.
 */
export function OrderStatusSelect({ orderId }: OrderStatusSelectProps) {
  const queryClient = useQueryClient();
  const transitions = useAdminOrderControllerGetAllowedTransitions(orderId);
  const updateStatus = useAdminOrderControllerUpdateStatus();

  const { allowed, expectedUpdatedAt } = toTransitionOptions(transitions.data);

  const conflict = orderConflictMessage(updateStatus.error as ApiErrorLike);
  const showReload = requiresReload(updateStatus.error as ApiErrorLike);

  const handleChange = (value: string) => {
    updateStatus.mutate(
      {
        orderId,
        data: {
          status: value as UpdateOrderStatusDto["status"],
          // The token travels with the write, so the server can refuse a change
          // decided against a version of this order that no longer exists
          // (edge case E-11). Omitted only if the option list has not loaded —
          // in which case there is nothing selectable anyway.
          ...(expectedUpdatedAt ? { expectedUpdatedAt } : {}),
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
          // The legal moves AND the lock token both changed with the write, so
          // the next edit must not be decided against the previous answer.
          void queryClient.invalidateQueries({
            queryKey:
              getAdminOrderControllerGetAllowedTransitionsQueryKey(orderId),
          });
          void queryClient.invalidateQueries({
            queryKey: getAdminOrderControllerGetHistoryQueryKey(orderId),
          });
          // TASK-248: a status change can move an order in/out of the PENDING and
          // unpaid-in-transit counters — refresh the needs-action widget + badges.
          void queryClient.invalidateQueries({
            queryKey: getAdminDashboardControllerGetNeedsActionQueryKey(),
          });
          toast.success(dict.orderStatus.toastUpdated(orderStatusLabel(value)));
        },
        onError: (error) => {
          const message = orderConflictMessage(error as ApiErrorLike);
          if (message) {
            // Refetch the options either way: after a forbidden transition they
            // are simply wrong, and after a stale write they are wrong AND the
            // token with them.
            void queryClient.invalidateQueries({
              queryKey:
                getAdminOrderControllerGetAllowedTransitionsQueryKey(orderId),
            });
            void queryClient.invalidateQueries({
              queryKey: getAdminOrderControllerFindByIdQueryKey(orderId),
            });
            toast.error(message);
            return;
          }
          toast.error(dict.orderStatus.toastFailed);
        },
      },
    );
  };

  const handleReload = () => {
    updateStatus.reset();
    void queryClient.invalidateQueries({
      queryKey: getAdminOrderControllerGetAllowedTransitionsQueryKey(orderId),
    });
    void queryClient.invalidateQueries({
      queryKey: getAdminOrderControllerFindByIdQueryKey(orderId),
    });
    void queryClient.invalidateQueries({
      queryKey: getAdminOrderControllerGetHistoryQueryKey(orderId),
    });
  };

  if (transitions.isLoading) {
    return (
      <p className="text-sm text-muted-foreground">
        {dict.orderStatus.transitionsLoading}
      </p>
    );
  }

  if (transitions.isError) {
    return (
      <p role="alert" className="text-sm text-destructive">
        {dict.orderStatus.transitionsLoadError}
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      {allowed.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          {dict.orderStatus.noTransitions}
        </p>
      ) : (
        <>
          <Select
            value=""
            onValueChange={handleChange}
            disabled={updateStatus.isPending}
          >
            <SelectTrigger
              className="w-56"
              aria-label={dict.orderStatus.updateAria}
            >
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
          <p className="text-xs text-muted-foreground">
            {dict.orderStatus.transitionsHint}
          </p>
        </>
      )}

      {conflict ? (
        <div
          role="alert"
          className="flex flex-wrap items-center gap-3 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive"
        >
          <span>{conflict}</span>
          {showReload ? (
            <Button variant="outline" size="sm" onClick={handleReload}>
              {dict.orderStatus.reloadCta}
            </Button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
