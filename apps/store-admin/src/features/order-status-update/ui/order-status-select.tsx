"use client";

import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "@/shared/ui/toast";
import {
  getAdminOrderControllerFindAllQueryKey,
  getAdminOrderControllerFindByIdQueryKey,
  getAdminOrderControllerGetAllowedTransitionsQueryKey,
  getAdminOrderControllerGetHistoryQueryKey,
  orderStatusLabel,
  useAdminOrderControllerFindById,
  useAdminOrderControllerGetAllowedTransitions,
  useAdminOrderControllerUpdateStatus,
  OrderEntityPaymentMethod,
  OrderEntityPaymentStatus,
  OrderEntityStatus,
  type UpdateOrderStatusDto,
} from "@/entities/order";
import {
  getAdminOrderReturnControllerFindForOrderQueryKey,
  getAdminReturnControllerFindAllQueryKey,
  useAdminOrderReturnControllerCreate,
  useAdminOrderReturnControllerFindForOrder,
} from "@/entities/return";
import { PERM } from "@/entities/permission";
import { useAuth } from "@/entities/session";
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
import { CreateReturnDialog } from "./create-return-dialog";
import { UnpaidShipDialog } from "./unpaid-ship-dialog";

interface OrderStatusSelectProps {
  orderId: string;
}

/**
 * Payment states that mean "no money has arrived yet" (TASK-468).
 *
 * Deliberately NOT `paymentStatus !== PAID`. `PARTIALLY_REFUNDED` and `REFUNDED`
 * are only reachable FROM `PAID` (see `PAYMENT_TRANSITIONS`), so on those the
 * money did arrive and warning about it would be a lie the operator learns to
 * dismiss — and a warning that is routinely wrong is worse than none, because it
 * trains people to click through the one that is right.
 */
const UNCONFIRMED_PAYMENT: readonly string[] = [
  OrderEntityPaymentStatus.PENDING,
  OrderEntityPaymentStatus.FAILED,
];

/**
 * Statuses the server will accept a return on — mirrors
 * `RETURNABLE_ORDER_STATUSES` in `return.service.ts` (review of plan 180).
 *
 * The goods have to have travelled before there is anything to send back. A
 * cancelled order fails this, and offering «Створити заявку» there produced a
 * 400 the operator could do nothing with.
 */
const RETURNABLE_STATUSES: readonly string[] = [
  OrderEntityStatus.SHIPPED,
  OrderEntityStatus.DELIVERED,
];

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
  const { can } = useAuth();
  const transitions = useAdminOrderControllerGetAllowedTransitions(orderId);
  const updateStatus = useAdminOrderControllerUpdateStatus();

  // The order itself, for the two questions the transitions endpoint does not
  // answer: how it is being paid for, and what is on it. The card above this
  // control already holds this query, so React Query serves both from one cache
  // entry and one request rather than fetching it twice.
  const { data: orderData } = useAdminOrderControllerFindById(orderId);
  const order = orderData?.data;

  // TASK-469: "has anyone opened a return on this order?" — asked only by an
  // operator who could actually create one. Without `returns:write` the dialog
  // would have nothing to offer, so the request is not issued at all rather than
  // being a guaranteed 403 on every order card.
  const canOpenReturns = can(PERM.returnsWrite);
  const { data: returnsData } = useAdminOrderReturnControllerFindForOrder(
    orderId,
    { query: { enabled: canOpenReturns } },
  );
  const createReturn = useAdminOrderReturnControllerCreate();

  // Which move is waiting behind a dialog. `null` means nothing is pending —
  // the state holds the STATUS rather than a boolean so the confirm handler
  // cannot possibly apply a different one than the operator picked.
  const [unpaidShipTarget, setUnpaidShipTarget] = useState<string | null>(null);
  const [refundTarget, setRefundTarget] = useState<string | null>(null);

  const { allowed, expectedUpdatedAt } = toTransitionOptions(transitions.data);

  const conflict = orderConflictMessage(updateStatus.error as ApiErrorLike);
  const showReload = requiresReload(updateStatus.error as ApiErrorLike);

  /**
   * The two soft warnings of decision B-1, in the order they can occur.
   *
   * Neither BLOCKS: the owner's rule is that we hard-refuse only the physically
   * impossible (that is the server's state machine, and it answers 409) and make
   * everything else visible. An operator who cannot move an order will mark it
   * paid falsely instead, and then the shop has lost the truth about its money in
   * exchange for a rule.
   */
  const warningFor = (
    value: string,
  ): "unpaidShip" | "refundNoReturn" | null => {
    if (!order) return null;

    if (
      value === OrderEntityStatus.SHIPPED &&
      order.paymentMethod === OrderEntityPaymentMethod.ONLINE &&
      UNCONFIRMED_PAYMENT.includes(order.paymentStatus)
    ) {
      return "unpaidShip";
    }

    // Only when the operator could act on the answer, and only once the list has
    // actually loaded: `returnsData` undefined means "not known yet", and
    // treating that as "there are none" would pop the dialog on orders that
    // already have a return.
    //
    // And only from a status the server would actually accept a return on
    // (review of plan 180). `ORDER_TRANSITIONS[CANCELLED]` contains REFUNDED,
    // but `RETURNABLE_ORDER_STATUSES` is {SHIPPED, DELIVERED} — so on a cancelled
    // order the dialog's primary button could only ever produce a 400 and a
    // generic toast, with nothing on screen saying that the secondary button is
    // the one that works. Refunding a cancelled order is the ordinary case, not
    // an exotic one, so it must not be the one that dead-ends.
    if (
      value === OrderEntityStatus.REFUNDED &&
      canOpenReturns &&
      order.status !== undefined &&
      RETURNABLE_STATUSES.includes(order.status) &&
      returnsData?.data?.length === 0
    ) {
      return "refundNoReturn";
    }

    return null;
  };

  const handleChange = (value: string) => {
    const warning = warningFor(value);
    if (warning === "unpaidShip") {
      setUnpaidShipTarget(value);
      return;
    }
    if (warning === "refundNoReturn") {
      setRefundTarget(value);
      return;
    }

    applyStatus(value);
  };

  function applyStatus(value: string) {
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
  }

  /** «Все одно відправити» — the operator has decided (TASK-468). */
  const handleUnpaidShipConfirm = () => {
    const target = unpaidShipTarget;
    setUnpaidShipTarget(null);
    if (target) applyStatus(target);
  };

  /**
   * «Створити заявку» — open the return on the whole order, then move the order
   * (TASK-469).
   *
   * The status change is chained to the return's SUCCESS, not fired alongside it:
   * REFUNDED with a record behind it is the outcome being asked for, and doing
   * both in parallel could leave the label set with the record refused — which is
   * the exact state this dialog exists to stop appearing.
   */
  const handleCreateReturn = (reason: string) => {
    const target = refundTarget;
    if (!target || !order) return;

    createReturn.mutate(
      {
        orderId,
        data: {
          ...(reason.trim() ? { reason: reason.trim() } : {}),
          items: order.items.map((item) => ({
            orderItemId: item.id,
            quantity: item.quantity,
          })),
        },
      },
      {
        onSuccess: () => {
          void queryClient.invalidateQueries({
            queryKey:
              getAdminOrderReturnControllerFindForOrderQueryKey(orderId),
          });
          void queryClient.invalidateQueries({
            queryKey: getAdminReturnControllerFindAllQueryKey(),
          });
          toast.success(dict.returns.createSuccess);
          setRefundTarget(null);
          applyStatus(target);
        },
        onError: () => {
          // The order is deliberately NOT moved: the operator asked for a refund
          // WITH a record, and half of that is the empty label we are here to
          // prevent. The dialog stays open so they can retry or decline.
          toast.error(dict.returns.createFailed);
        },
      },
    );
  };

  /** «Лише змінити статус» — a real answer, not a cancel (TASK-469). */
  const handleSkipReturn = () => {
    const target = refundTarget;
    setRefundTarget(null);
    if (target) applyStatus(target);
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

      {/* TASK-468 — ONLINE + SHIPPED with no confirmed payment. A speed bump
          with the amount on it, not a gate. */}
      {order ? (
        <UnpaidShipDialog
          open={unpaidShipTarget !== null}
          onOpenChange={(next) => {
            if (!next) setUnpaidShipTarget(null);
          }}
          total={order.total}
          onConfirm={handleUnpaidShipConfirm}
          disabled={updateStatus.isPending}
        />
      ) : null}

      {/* TASK-469 — REFUNDED with no Return anywhere on the order. */}
      {order ? (
        <CreateReturnDialog
          open={refundTarget !== null}
          onOpenChange={(next) => {
            if (!next) setRefundTarget(null);
          }}
          orderNumber={order.id.slice(0, 8).toUpperCase()}
          items={order.items.map((item) => ({
            id: item.id,
            productName: item.productName,
            quantity: item.quantity,
            lineTotal: item.lineTotal,
          }))}
          onCreate={handleCreateReturn}
          onSkip={handleSkipReturn}
          disabled={createReturn.isPending || updateStatus.isPending}
        />
      ) : null}
    </div>
  );
}
