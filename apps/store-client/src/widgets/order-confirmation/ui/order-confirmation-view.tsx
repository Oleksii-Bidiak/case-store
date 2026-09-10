"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/entities/session";
import { useGetOrder } from "@/entities/order";
import { CancelOrderButton } from "@/features/cancel-order";
import { forgetPaymentAttempt, readPaymentAttempt } from "@/features/checkout";
import { dict } from "@/shared/config";
import { trackEvent } from "@/shared/lib";
import { OrderConfirmationSkeleton } from "./order-confirmation-skeleton";
import { OrderConfirmationHeader } from "./order-confirmation-header";
import { OrderItemList } from "./order-item-list";
import { OrderAddressSummary } from "./order-address-summary";
import { OrderPaymentPanel } from "./order-payment-panel";
import { OrderTotalsBreakdown } from "./order-totals-breakdown";

interface OrderConfirmationViewProps {
  orderId: string;
}

/**
 * How long to keep asking the server whether the payment callback has landed,
 * measured from the moment this browser was handed off to the provider.
 *
 * Long enough to cover a 3-D Secure detour and a provider retry; short enough
 * that a shopper whose callback never arrives is told so plainly instead of
 * watching a spinner indefinitely. Past this window the reconciliation cron is
 * the safety net — not the shopper's patience.
 */
const CALLBACK_WAIT_MS = 3 * 60 * 1000;
const CALLBACK_POLL_MS = 4000;

const primaryCta =
  "inline-block rounded-lg bg-primary px-6 py-3 font-semibold text-primary-foreground hover:opacity-90 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring";

/**
 * OrderConfirmationView — client orchestrator for `/orders/[id]/confirmation`.
 *
 * Guards in order (mirrors CheckoutView):
 *   1. While the silent auth refresh is in-flight, render a skeleton.
 *   2. Unauthenticated → redirect to `/login?redirect=…` (GET /api/orders/:id
 *      requires a JWT and is scoped to the owning user).
 *   3. Authenticated → fetch the order; render loading / not-found / success.
 *
 * The page does NOT depend on cart state — the cart was emptied by the backend
 * when the order was created.
 */
export function OrderConfirmationView({ orderId }: OrderConfirmationViewProps) {
  const router = useRouter();
  const { isAuthenticated, isInitializing } = useAuth();

  // Did THIS browser just go off to pay for THIS order? Read once per order id.
  // It is session-local and forgeable, so it may influence wording and polling
  // and nothing else — every statement about money comes from `paymentStatus`.
  const attempt = useMemo(() => readPaymentAttempt(orderId), [orderId]);
  const callbackDeadline = attempt ? attempt.startedAt + CALLBACK_WAIT_MS : 0;

  // Whether the wait window has run out. Held in state and flipped by a timer
  // rather than compared against `Date.now()` during render: a render-time clock
  // read is impure, and — worse here — it would only ever change when something
  // unrelated happened to re-render, so a shopper staring at the page could sit
  // on "confirming…" long past the point where we know better.
  const [waitElapsed, setWaitElapsed] = useState(false);
  useEffect(() => {
    if (!attempt) return;
    // Clamped rather than branched: an already-expired attempt schedules a
    // zero-delay timer instead of setting state synchronously inside the effect,
    // which would cascade an extra render for no benefit.
    const remaining = Math.max(0, callbackDeadline - Date.now());
    const timer = setTimeout(() => setWaitElapsed(true), remaining);
    return () => clearTimeout(timer);
  }, [attempt, callbackDeadline]);

  const { data, isLoading, isError, error, refetch } = useGetOrder(orderId, {
    query: {
      enabled: isAuthenticated,
      // Poll only while there is a real reason to: this browser paid, the server
      // still says PENDING, and we are inside the wait window. The predicate form
      // reads the freshest cached order, so the first non-PENDING response stops
      // the loop by itself.
      refetchInterval: (query) => {
        if (!attempt) return false;
        if (query.state.data?.data?.paymentStatus !== "PENDING") return false;
        if (Date.now() > callbackDeadline) return false;
        return CALLBACK_POLL_MS;
      },
    },
  });

  // Once the payment reaches a settled state the note has done its job. Clearing
  // it stops a later visit to this page from re-entering the "confirming" copy.
  const settledStatus = data?.data?.paymentStatus;
  useEffect(() => {
    if (settledStatus && settledStatus !== "PENDING") {
      forgetPaymentAttempt(orderId);
    }
  }, [settledStatus, orderId]);

  // Redirect unauthenticated visitors to login (once init has settled).
  useEffect(() => {
    if (!isInitializing && !isAuthenticated) {
      router.replace(`/login?redirect=/orders/${orderId}/confirmation`);
    }
  }, [isInitializing, isAuthenticated, orderId, router]);

  // Analytics: report the completed purchase (funnel step 4) once, after the
  // order first loads. The ref is keyed on the order id so a later refetch of
  // the same order does not double-count it and inflate the funnel.
  const purchaseTracked = useRef<string | null>(null);
  useEffect(() => {
    const loaded = data?.data;
    if (!loaded || purchaseTracked.current === loaded.id) return;
    purchaseTracked.current = loaded.id;
    trackEvent("purchase", { orderId: loaded.id, amount: loaded.total });
  }, [data?.data]);

  if (isInitializing || !isAuthenticated || isLoading) {
    return <OrderConfirmationSkeleton />;
  }

  const order = data?.data;
  const status = error?.response?.status;

  // A non-404 failure (network blip, 5xx) is transient, not a missing order —
  // let the user retry the request rather than dead-ending on "not found".
  if (isError && status !== 404) {
    return (
      <div role="alert" className="flex flex-col items-start gap-4 py-16">
        <h1 className="text-2xl font-bold text-foreground">
          {dict.order.somethingWrong}
        </h1>
        <p className="text-muted-foreground">{dict.order.loadErrorBody}</p>
        <button
          type="button"
          onClick={() => void refetch()}
          className={primaryCta}
        >
          {dict.common.tryAgain}
        </button>
      </div>
    );
  }

  // A 404 (missing or non-owned order) is terminal; a successful response with
  // no order body is treated the same way.
  if (!order) {
    return (
      <div role="alert" className="flex flex-col items-start gap-4 py-16">
        <h1 className="text-2xl font-bold text-foreground">
          {dict.order.notFoundHeading}
        </h1>
        <p className="text-muted-foreground">{dict.order.notFoundBody}</p>
        <Link href="/" className={primaryCta}>
          {dict.common.goHome}
        </Link>
      </div>
    );
  }

  // `notes` is generated as a loose nullable object; narrow to a display string.
  const notes = typeof order.notes === "string" ? order.notes : null;

  return (
    <div className="flex flex-col gap-8">
      <OrderConfirmationHeader
        orderId={order.id}
        status={order.status}
        paymentStatus={order.paymentStatus}
        createdAt={order.createdAt}
      />

      {/* Every claim about money comes from the server's `paymentStatus`.
          Arriving here from the provider's redirect proves only that a browser
          was pointed at this URL — the money is confirmed by a signed callback
          that may still be in flight (docs/payments-liqpay.md §4, rule 1).
          `status` is passed for one narrow purpose: a closed order gets no
          retry button (TASK-407). */}
      <OrderPaymentPanel
        orderId={order.id}
        paymentStatus={order.paymentStatus}
        orderStatus={order.status}
        hasRecentAttempt={!!attempt}
        isAwaitingCallback={!!attempt && !waitElapsed}
      />

      <div className="flex flex-col gap-8 lg:grid lg:grid-cols-3">
        <div className="flex flex-col gap-8 lg:col-span-2">
          <OrderItemList items={order.items} />
          <OrderAddressSummary
            shippingAddress={order.shippingAddress}
            billingAddress={order.billingAddress}
          />

          <div className="flex flex-wrap gap-4">
            <Link href="/" className={primaryCta}>
              {dict.common.continueShopping}
            </Link>
            {order.status === "PENDING" && (
              <CancelOrderButton orderId={order.id} />
            )}
          </div>
        </div>

        <aside className="flex flex-col gap-6 lg:col-span-1 lg:self-start">
          <OrderTotalsBreakdown
            subtotal={order.subtotal}
            discount={order.discount}
            shippingCost={order.shippingCost}
            tax={order.tax}
            total={order.total}
          />

          {notes && (
            <div className="flex flex-col gap-2 rounded-lg border border-border bg-card p-6">
              <h2 className="text-lg font-semibold text-foreground">
                {dict.order.notesTitle}
              </h2>
              <p className="text-sm text-muted-foreground">{notes}</p>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}
