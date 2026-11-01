"use client";

import { useState, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "@/shared/ui/toast";
import {
  getAdminOrderControllerFindAllQueryKey,
  getAdminOrderControllerFindByIdQueryKey,
  getAdminOrderMoneyControllerGetQueryKey,
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
import { PERM } from "@/entities/permission";
import { useAuth } from "@/entities/session";
import { getAdminDashboardControllerGetNeedsActionQueryKey } from "@/entities/dashboard";
import { ChevronDownIcon, TruckIcon } from "lucide-react";
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/shared/ui";
import { dict } from "@/shared/config";
import { toTransitionOptions } from "../model/transitions";
import {
  orderConflictMessage,
  orderWriteErrorMessage,
  requiresReload,
  type ApiErrorLike,
} from "../model/order-conflict";
import { UnpaidShipDialog } from "./unpaid-ship-dialog";

interface OrderStatusSelectProps {
  orderId: string;
  /** Drawn at the end of the button row — the card's «⋯» menu. */
  trailing?: ReactNode;
}

/**
 * The statuses an operator can set, lifecycle first — the menu's order.
 *
 * REFUNDED is not among them (R2, TASK-1969): it is no status anyone picks. The
 * server sets it when the payouts on the order's returns cover the goods that
 * came back, and takes it back when a payout is reversed — so it is neither
 * offered nor listed as «Недоступно зараз». It still reads as the CURRENT
 * status when the order is there.
 */
const LIFECYCLE: readonly string[] = [
  OrderEntityStatus.PENDING,
  OrderEntityStatus.CONFIRMED,
  OrderEntityStatus.PROCESSING,
  OrderEntityStatus.SHIPPED,
  OrderEntityStatus.DELIVERED,
  OrderEntityStatus.CANCELLED,
];

/** The forward path, for «назад не можна». */
const FORWARD: readonly string[] = LIFECYCLE.slice(0, 5);

/**
 * The primary button: the natural next step (OrdersProposal К1). Offered only
 * when the server lists it among the legal moves.
 */
const NEXT_STEP: Readonly<Record<string, { status: string; label: string }>> = {
  [OrderEntityStatus.PENDING]: {
    status: OrderEntityStatus.CONFIRMED,
    label: dict.orderStatus.nextConfirm,
  },
  [OrderEntityStatus.CONFIRMED]: {
    status: OrderEntityStatus.SHIPPED,
    label: dict.orderStatus.nextShip,
  },
  [OrderEntityStatus.PROCESSING]: {
    status: OrderEntityStatus.SHIPPED,
    label: dict.orderStatus.nextShip,
  },
  [OrderEntityStatus.SHIPPED]: {
    status: OrderEntityStatus.DELIVERED,
    label: dict.orderStatus.nextDeliver,
  },
};

/**
 * Why a status is NOT on the server's list right now (К2 «Недоступно зараз»).
 *
 * Words only: WHICH moves are legal is the server's answer (`allowed`), never
 * re-derived here — this only names the likely reason for the ones it left
 * out, from the same few facts the state machine is built on.
 */
export function unavailableReason(current: string, target: string): string {
  const s = dict.orderStatus;
  if (current === OrderEntityStatus.REFUNDED) return s.reasonRefundedFinal;
  if (current === OrderEntityStatus.CANCELLED) return s.reasonReviveFirst;
  if (
    FORWARD.includes(current) &&
    FORWARD.includes(target) &&
    FORWARD.indexOf(target) < FORWARD.indexOf(current)
  ) {
    return s.reasonNoWayBack;
  }
  return s.reasonOther;
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
 *
 * Not rendered at all without `orders:write` (TASK-715): the PATCH answers 403
 * to anyone else, and a picker that offers moves only to have each one refused
 * with a misleading "somebody changed this order" toast teaches the operator to
 * distrust the panel. The server stays the barrier; this just stops lying.
 */
export function OrderStatusSelect(props: OrderStatusSelectProps) {
  const { can } = useAuth();
  if (!can(PERM.ordersWrite)) return null;
  return <OrderStatusSelectControl {...props} />;
}

function OrderStatusSelectControl({
  orderId,
  trailing,
}: OrderStatusSelectProps) {
  const queryClient = useQueryClient();
  const transitions = useAdminOrderControllerGetAllowedTransitions(orderId);
  const updateStatus = useAdminOrderControllerUpdateStatus();

  // The order itself, for the two questions the transitions endpoint does not
  // answer: how it is being paid for, and what is on it. The card above this
  // control already holds this query, so React Query serves both from one cache
  // entry and one request rather than fetching it twice.
  const { data: orderData } = useAdminOrderControllerFindById(orderId);
  const order = orderData?.data;

  // Which move is waiting behind the dialog. `null` means nothing is pending —
  // the state holds the STATUS rather than a boolean so the confirm handler
  // cannot possibly apply a different one than the operator picked.
  //
  // The second dialog — «Повернення коштів без заявки?» (TASK-469 → TASK-1963)
  // — is gone with the REFUNDED option itself (R2, TASK-1969): money for
  // returned goods goes out from the return's page, and the status follows.
  const [unpaidShipTarget, setUnpaidShipTarget] = useState<string | null>(null);

  const { allowed, expectedUpdatedAt } = toTransitionOptions(transitions.data);

  // A 409 (with or without the reload button) or, since TASK-622, a 403 naming
  // the missing grant — both stay on screen until the next attempt.
  const conflict = orderWriteErrorMessage(updateStatus.error as ApiErrorLike);
  const showReload = requiresReload(updateStatus.error as ApiErrorLike);

  /**
   * The soft warning of decision B-1: shipping an online order whose payment
   * has not arrived. It does not BLOCK: the owner's rule is that we hard-refuse
   * only the physically impossible (that is the server's state machine, and it
   * answers 409) and make everything else visible.
   */
  const asksAboutPayment = (value: string): boolean =>
    order !== undefined &&
    value === OrderEntityStatus.SHIPPED &&
    order.paymentMethod === OrderEntityPaymentMethod.ONLINE &&
    UNCONFIRMED_PAYMENT.includes(order.paymentStatus);

  const handleChange = (value: string) => {
    if (asksAboutPayment(value)) {
      setUnpaidShipTarget(value);
      return;
    }
    applyStatus(value);
  };

  function applyStatus(
    value: string,
    options: { confirmUnpaidShipment?: boolean } = {},
  ) {
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
          // TASK-788: the operator's «Все одно відправити». The server writes
          // the history note from the payment state; this states the intent.
          ...(options.confirmUnpaidShipment
            ? { confirmUnpaidShipment: true }
            : {}),
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
          // TASK-842 → R2: what the «Оплата» block offers depends on the order
          // status too — cancelling a paid order is exactly what unlocks «Повернути
          // гроші», and the status write moved the lock token the block sends
          // back. The Orval keys are flat strings, so invalidating `findById`
          // does not reach this one by prefix.
          void queryClient.invalidateQueries({
            queryKey: getAdminOrderMoneyControllerGetQueryKey(orderId),
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
            // The order moved under us — its payment options may have moved
            // with it (TASK-842).
            void queryClient.invalidateQueries({
              queryKey: getAdminOrderMoneyControllerGetQueryKey(orderId),
            });
            toast.error(message);
            return;
          }
          toast.error(
            orderWriteErrorMessage(error as ApiErrorLike) ??
              dict.orderStatus.toastFailed,
          );
        },
      },
    );
  }

  /** «Все одно відправити» — the operator has decided (TASK-468). */
  const handleUnpaidShipConfirm = () => {
    const target = unpaidShipTarget;
    setUnpaidShipTarget(null);
    if (target) applyStatus(target, { confirmUnpaidShipment: true });
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
      queryKey: getAdminOrderMoneyControllerGetQueryKey(orderId),
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

  const current = transitions.data?.data?.current ?? order?.status ?? "";
  const unavailable = LIFECYCLE.filter(
    (status) => status !== current && !allowed.includes(status),
  );
  const next = NEXT_STEP[current];
  const nextAction = next && allowed.includes(next.status) ? next : null;
  const askPayment = asksAboutPayment;

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        {allowed.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {dict.orderStatus.noTransitions}
          </p>
        ) : (
          <DropdownMenu modal={false}>
            <DropdownMenuTrigger asChild>
              <Button
                type="button"
                variant="outline"
                disabled={updateStatus.isPending}
                className="data-[state=open]:bg-secondary"
              >
                {dict.orders.updateStatus}
                <ChevronDownIcon aria-hidden="true" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-80">
              <DropdownMenuLabel className="text-xs font-semibold text-muted-foreground">
                {dict.orderStatus.menuCurrent(orderStatusLabel(current))}
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuGroup aria-label={dict.orderStatus.menuAllowed}>
                <DropdownMenuLabel className="text-xs font-semibold text-muted-foreground">
                  {dict.orderStatus.menuAllowed}
                </DropdownMenuLabel>
                {allowed.map((status) => (
                  <DropdownMenuItem
                    key={status}
                    variant={
                      status === OrderEntityStatus.CANCELLED
                        ? "destructive"
                        : "default"
                    }
                    onSelect={() => handleChange(status)}
                  >
                    {orderStatusLabel(status)}
                    {askPayment(status) ? (
                      <span
                        aria-hidden="true"
                        className="ml-auto text-xs text-muted-foreground"
                      >
                        {dict.orderStatus.menuAskPayment}
                      </span>
                    ) : null}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuGroup>
              {unavailable.length ? (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuGroup
                    aria-label={dict.orderStatus.menuUnavailable}
                  >
                    <DropdownMenuLabel className="text-xs font-semibold text-muted-foreground">
                      {dict.orderStatus.menuUnavailable}
                    </DropdownMenuLabel>
                    {unavailable.map((status) => (
                      <DropdownMenuItem key={status} disabled>
                        {orderStatusLabel(status)}
                        <span className="ml-auto text-xs text-muted-foreground">
                          {unavailableReason(current, status)}
                        </span>
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuGroup>
                </>
              ) : null}
              <p className="px-2 pt-1 pb-1.5 text-xs text-muted-foreground">
                {dict.orderStatus.transitionsHint}
              </p>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
        {/* The natural next step, one click — the SAME mutation and the same
            unpaid-shipment question as picking it from the menu. */}
        {nextAction ? (
          <Button
            type="button"
            disabled={updateStatus.isPending}
            onClick={() => handleChange(nextAction.status)}
          >
            {nextAction.status === OrderEntityStatus.SHIPPED ? (
              <TruckIcon aria-hidden="true" />
            ) : null}
            {nextAction.label}
          </Button>
        ) : null}
        {trailing}
      </div>

      {conflict ? (
        <div
          role="alert"
          className="flex basis-full flex-wrap items-center gap-3 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive"
        >
          <span className="flex-1">{conflict}</span>
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
    </>
  );
}
