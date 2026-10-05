"use client";

import { useState, type ReactNode } from "react";
import { Ban, Check, Clock, Loader2, Undo2, X } from "lucide-react";
import type {
  OrderEntityPaymentStatus,
  OrderEntityStatus,
} from "@/entities/order";
import { dict } from "@/shared/config";
import { cn } from "@/shared/lib/utils";
import { Button } from "@/shared/ui";
import {
  retryHandoffMessage,
  useOrderPayment,
  type PaymentStartFailure,
} from "../model/use-order-payment";

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

/**
 * Whether the panel offers «Спробувати ще раз» as a PRIMARY button: a declined
 * payment on an order that is still open. The confirmation page reads the same
 * answer to demote its own «Продовжити покупки» to outline, so the screen keeps
 * one primary action (design-system §1, TASK-865). The slow-PENDING retry is an
 * outline button and does not count.
 */
export function offersPaymentRetry(
  paymentStatus: OrderEntityPaymentStatus,
  orderStatus: OrderEntityStatus,
): boolean {
  return paymentStatus === "FAILED" && !isClosedOrder(orderStatus);
}

/** An unpaid ONLINE order that still holds its stock reservation (TASK-217). */
export interface AwaitingPayment {
  /** Whole minutes left — `awaitingPaymentMinutes`; `0` = not awaiting. */
  minutes: number;
  /** The reservation deadline, already formatted «14:52». */
  until: string;
  /** The order total, already formatted «3 200 ₴». */
  total: string;
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
  /**
   * The account order detail passes this for an unpaid online order (TASK-217):
   * with no recent attempt in this browser, the panel then says how long the
   * goods are held and offers «Оплатити {total}». The confirmation page leaves
   * it out — there a silent PENDING stays silent.
   */
  awaiting?: AwaitingPayment;
}

type Tone = "positive" | "neutral" | "warning" | "negative";

const FRAME: Record<Tone, string> = {
  positive: "border-border bg-card",
  neutral: "border-border bg-card",
  warning: "border-warning/55 bg-warning/10",
  negative: "border-destructive/40 bg-destructive/5",
};

const ICON: Record<Tone, string> = {
  positive: "text-success",
  neutral: "text-muted-foreground",
  // Foreground, not warning: amber on its own tint is under 3:1.
  warning: "text-foreground",
  negative: "text-destructive",
};

/** AccountOrders.dc.html `.ao-btn`: 44px, the CTA radius. */
const ACTION_CLASS = "h-11 self-start rounded-cta px-4.5 font-semibold";

/**
 * OrderPaymentPanel — what the shopper is told about the money (TASK-330-B),
 * on the checkout confirmation page and the account order detail (TASK-217).
 *
 * ── The rule this component exists to enforce ─────────────────────────────────
 * The shopper arrives at the confirmation page from the provider's `result_url`.
 * That redirect is **unauthenticated and trivially forgeable** — anyone can type
 * the URL — and it is not what moves money. Money moves on a signed
 * server-to-server callback that may arrive seconds later, or on the
 * reconciliation cron if it never arrives at all (docs/payments-liqpay.md
 * §3–§4, rule 1).
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
 * so reusing the old handoff would fail every time. «Оплатити» on an awaiting
 * order is the same call.
 *
 * The retry is withheld once the ORDER is closed ({@link CLOSED_ORDER_STATUSES},
 * TASK-407). Both retry branches used to reason from `paymentStatus` alone, so a
 * shopper who cancelled an order with a declined payment was still invited to pay
 * for it — twice over, since the slow-PENDING branch offered the same button.
 *
 * ── Look (TASK-217, AccountOrders.dc.html `.ao-panel`) ─────────────────────────
 * A bordered card with no shadow — a message, not a block of content: neutral on
 * `card`, the awaiting state on a warning tint, a declined payment on a
 * destructive one. At most one primary button. Deliberately not a live region:
 * the awaiting title is a countdown, and a region that re-announced «Очікує
 * оплати · 22 хв» every minute would be noise.
 */
export function OrderPaymentPanel({
  orderId,
  paymentStatus,
  orderStatus,
  hasRecentAttempt,
  isAwaitingCallback,
  awaiting,
}: OrderPaymentPanelProps) {
  const { startPayment, isStarting } = useOrderPayment();
  const [failure, setFailure] = useState<PaymentStartFailure | null>(null);

  const copy = dict.order.payment;

  const pay = async () => {
    setFailure(null);
    const reason = await startPayment(orderId);
    // On success the browser is already leaving for the provider's page.
    if (reason) setFailure(reason);
  };

  const action = (label: string, primary: boolean) => (
    <div className="flex flex-col gap-2">
      <Button
        type="button"
        variant={primary ? "default" : "outline"}
        onClick={() => void pay()}
        disabled={isStarting}
        className={ACTION_CLASS}
      >
        {isStarting ? copy.retrying : label}
      </Button>
      {failure && (
        <p role="alert" className="text-sm text-destructive">
          {retryHandoffMessage(failure)}
        </p>
      )}
    </div>
  );

  const shell = (
    tone: Tone,
    icon: ReactNode,
    title: string,
    body: string,
    extra?: ReactNode,
  ) => (
    <section
      data-testid="order-payment-panel"
      data-tone={tone}
      className={cn(
        "flex flex-col gap-3 rounded-card border p-5 sm:p-6",
        FRAME[tone],
      )}
    >
      <h2 className="flex items-center gap-2 text-lg font-semibold text-foreground">
        <span className={cn("inline-flex shrink-0", ICON[tone])}>{icon}</span>
        {title}
      </h2>
      {/* Foreground on the warning tint: muted-foreground there is under 4.5:1. */}
      <p
        className={cn(
          "text-sm",
          tone === "warning" ? "text-foreground" : "text-muted-foreground",
        )}
      >
        {body}
      </p>
      {extra}
    </section>
  );

  if (paymentStatus === "PAID") {
    return shell(
      "positive",
      <Check className="size-5" strokeWidth={2.5} aria-hidden />,
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

  if (offersPaymentRetry(paymentStatus, orderStatus)) {
    return shell(
      "negative",
      <X className="size-5" strokeWidth={2.5} aria-hidden />,
      copy.failedTitle,
      copy.failedBody,
      action(copy.retry, true),
    );
  }

  // PENDING. This browser went off to pay: say we are confirming, or — once
  // the wait window is over — that the confirmation is late.
  if (hasRecentAttempt) {
    return isAwaitingCallback
      ? shell(
          "neutral",
          <Loader2
            className="size-5 animate-spin motion-reduce:animate-none"
            aria-hidden
          />,
          copy.pendingTitle,
          copy.pendingBody,
          <p className="text-xs text-muted-foreground">{copy.pendingNote}</p>,
        )
      : shell(
          "neutral",
          <Clock className="size-5" aria-hidden />,
          copy.slowTitle,
          copy.slowBody,
          action(copy.retry, false),
        );
  }

  // An unpaid online order still holding its goods (the account detail only).
  if (awaiting && awaiting.minutes > 0) {
    return shell(
      "warning",
      <Clock className="size-5" aria-hidden />,
      dict.orderHistory.awaitingPayment(awaiting.minutes),
      copy.awaitingBody(awaiting.until),
      action(dict.orderHistory.pay(awaiting.total), true),
    );
  }

  // Otherwise say nothing at all — a cash-on-delivery order is PENDING by
  // design, and telling that shopper we are "confirming their payment" would be
  // a small lie of its own.
  return null;
}
