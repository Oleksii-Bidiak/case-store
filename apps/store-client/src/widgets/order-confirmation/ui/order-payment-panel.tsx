"use client";

import { useState } from "react";
import {
  Ban,
  CheckCircle2,
  Loader2,
  XCircle,
  Undo2,
  Clock,
} from "lucide-react";
import type {
  OrderEntityPaymentStatus,
  OrderEntityStatus,
} from "@/entities/order";
import {
  retryHandoffMessage,
  useOrderPayment,
  type PaymentStartFailure,
} from "@/features/checkout";
import { Button } from "@/shared/ui";
import { dict } from "@/shared/config";

/**
 * Order statuses past which no further payment can be started (TASK-407).
 *
 * Not a judgement about the money — `paymentStatus` keeps that job — but about
 * the ORDER: a cancelled, refunded or already-delivered order has nothing left
 * to pay for, and `POST /api/payments/orders/:id/checkout` answers 409 for every
 * one of them. Offering «Спробувати ще раз» there sent the shopper to a button
 * that could only ever fail.
 */
const CLOSED_ORDER_STATUSES = [
  "CANCELLED",
  "REFUNDED",
  "DELIVERED",
] as const satisfies readonly OrderEntityStatus[];

function isClosedOrder(status: OrderEntityStatus): boolean {
  return (CLOSED_ORDER_STATUSES as readonly string[]).includes(status);
}

interface OrderPaymentPanelProps {
  orderId: string;
  /** The server's word on the money. The ONLY thing this panel may assert from. */
  paymentStatus: OrderEntityPaymentStatus;
  /**
   * The server's word on the order. Read only to decide whether a retry is
   * still possible — never to say anything about whether money moved.
   */
  orderStatus: OrderEntityStatus;
  /**
   * Whether this browser recently handed itself off to the provider for this
   * order. Local, forgeable, and used for nothing but choosing wording — see
   * `features/checkout/lib/payment-attempt.ts`.
   */
  hasRecentAttempt: boolean;
  /** True while we are still refetching in the hope the callback lands. */
  isAwaitingCallback: boolean;
}

/**
 * OrderPaymentPanel — what the shopper is told about the money (TASK-330-B).
 *
 * ── The rule this component exists to enforce ─────────────────────────────────
 * The shopper arrives here from the provider's `result_url`. That redirect is
 * **unauthenticated and trivially forgeable** — anyone can type the URL — and it
 * is not what moves money. Money moves on a signed server-to-server callback that
 * may arrive seconds later, or on the reconciliation cron if it never arrives at
 * all (docs/payments-liqpay.md §3–§4, rule 1).
 *
 * So this panel never reasons from "the shopper came back". It renders
 * {@link paymentStatus} — the server's answer — and nothing else decides whether
 * the word "оплачено" appears. `hasRecentAttempt` may soften a PENDING into "we
 * are confirming your payment" rather than silence, because a cash-on-delivery
 * order is also PENDING and forever will be; that is a choice of sentence, not a
 * claim about money.
 *
 * ── Retry ─────────────────────────────────────────────────────────────────────
 * A failed payment gets a retry that calls the checkout endpoint again. Each call
 * opens a **new** `Payment` with a new id, which is not an implementation detail:
 * the provider refuses a second payment under an identifier it has already seen,
 * so reusing the old handoff would fail every time.
 *
 * The retry is withheld once the ORDER is closed ({@link CLOSED_ORDER_STATUSES},
 * TASK-407). Both retry branches used to reason from `paymentStatus` alone, so a
 * shopper who cancelled an order with a declined payment was still invited to pay
 * for it — twice over, since the slow-PENDING branch offered the same button.
 */
export function OrderPaymentPanel({
  orderId,
  paymentStatus,
  orderStatus,
  hasRecentAttempt,
  isAwaitingCallback,
}: OrderPaymentPanelProps) {
  const { startPayment, isStarting } = useOrderPayment();
  const [failure, setFailure] = useState<PaymentStartFailure | null>(null);

  const copy = dict.order.payment;

  const retry = async () => {
    setFailure(null);
    const reason = await startPayment(orderId);
    // On success the browser is already leaving for the provider's page.
    if (reason) setFailure(reason);
  };

  const shell = (
    tone: "positive" | "neutral" | "negative",
    icon: React.ReactNode,
    title: string,
    body: string,
    extra?: React.ReactNode,
  ) => (
    <section
      className={[
        "flex flex-col gap-3 rounded-lg border p-6",
        tone === "negative"
          ? "border-destructive/40 bg-destructive/5"
          : "border-border bg-card",
      ].join(" ")}
    >
      <h2 className="flex items-center gap-2 text-lg font-semibold text-foreground">
        <span
          className={
            tone === "negative"
              ? "text-destructive"
              : tone === "positive"
                ? "text-primary"
                : "text-muted-foreground"
          }
        >
          {icon}
        </span>
        {title}
      </h2>
      <p className="text-sm text-muted-foreground">{body}</p>
      {extra}
    </section>
  );

  if (paymentStatus === "PAID") {
    return shell(
      "positive",
      <CheckCircle2 className="size-5" aria-hidden />,
      copy.paidTitle,
      copy.paidBody,
    );
  }

  if (paymentStatus === "REFUNDED") {
    return shell(
      "neutral",
      <Undo2 className="size-5" aria-hidden />,
      copy.refundedTitle,
      copy.refundedBody,
    );
  }

  // The order is closed: whatever the payment status says, there is no second
  // attempt to offer. Checked BEFORE the two retry branches below, which is the
  // whole point — each of them used to render its own «Спробувати ще раз» here.
  if (isClosedOrder(orderStatus)) {
    const cancelled = orderStatus !== "DELIVERED";
    // Say nothing to the cash-on-delivery shopper whose delivered order was
    // never going to be paid online — the silent PENDING branch below is right
    // for them too.
    if (!cancelled && paymentStatus !== "FAILED") return null;

    return shell(
      "neutral",
      <Ban className="size-5" aria-hidden />,
      cancelled ? copy.orderCancelledTitle : copy.orderClosedTitle,
      cancelled ? copy.orderCancelledBody : copy.orderClosedBody,
    );
  }

  if (paymentStatus === "FAILED") {
    return shell(
      "negative",
      <XCircle className="size-5" aria-hidden />,
      copy.failedTitle,
      copy.failedBody,
      <div className="flex flex-col gap-2">
        <Button
          type="button"
          onClick={() => void retry()}
          disabled={isStarting}
          className="self-start"
        >
          {isStarting ? copy.retrying : copy.retry}
        </Button>
        {failure && (
          <p role="alert" className="text-sm text-destructive">
            {retryHandoffMessage(failure)}
          </p>
        )}
      </div>,
    );
  }

  // PENDING. Say nothing at all unless this browser actually went off to pay —
  // a cash-on-delivery order is PENDING by design, and telling that shopper we
  // are "confirming their payment" would be a small lie of its own.
  if (!hasRecentAttempt) return null;

  return isAwaitingCallback
    ? shell(
        "neutral",
        <Loader2 className="size-5 animate-spin" aria-hidden />,
        copy.pendingTitle,
        copy.pendingBody,
        <p className="text-xs text-muted-foreground">{copy.pendingNote}</p>,
      )
    : shell(
        "neutral",
        <Clock className="size-5" aria-hidden />,
        copy.slowTitle,
        copy.slowBody,
        <div className="flex flex-col gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => void retry()}
            disabled={isStarting}
            className="self-start"
          >
            {isStarting ? copy.retrying : copy.retry}
          </Button>
          {failure && (
            <p role="alert" className="text-sm text-destructive">
              {retryHandoffMessage(failure)}
            </p>
          )}
        </div>,
      );
}
