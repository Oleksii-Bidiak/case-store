"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/entities/session";
import {
  OrderTotalsBreakdown,
  orderDeliveryDetails,
  useGetOrder,
} from "@/entities/order";
import { CancelOrderButton } from "@/features/cancel-order";
import { ReturnRequestButton } from "@/features/return-request";
import {
  OrderPaymentPanel,
  offersPaymentRetry,
  useForgetSettledPaymentAttempt,
  usePaymentAttemptWatch,
} from "@/features/checkout";
import { dict, H1_CLASS } from "@/shared/config";
import { trackEvent } from "@/shared/lib";
import { Button } from "@/shared/ui";
import { OrderConfirmationSkeleton } from "./order-confirmation-skeleton";
import { OrderConfirmationHeader } from "./order-confirmation-header";
import { OrderItemList } from "./order-item-list";
import { OrderAddressSummary } from "./order-address-summary";

interface OrderConfirmationViewProps {
  orderId: string;
}

/**
 * The page-level CTA box on the `Button` primitive (focus ring, disabled tokens):
 * 48px tall, the CTA radius. The variant is the caller's — primary unless the
 * payment panel already holds the page's one primary action (TASK-865).
 */
const PAGE_CTA = "h-12 rounded-cta px-6 text-base font-semibold";

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

  // The payment-callback wait (TASK-330-B): whether this browser just went off
  // to pay, whether we are still inside the wait window, and the poll that
  // asks the server meanwhile. Shared with the account order detail (TASK-217).
  const watch = usePaymentAttemptWatch(orderId);

  const { data, isLoading, isError, error, refetch } = useGetOrder(orderId, {
    query: {
      enabled: isAuthenticated,
      refetchInterval: watch.refetchInterval,
    },
  });

  useForgetSettledPaymentAttempt(orderId, data?.data?.paymentStatus);

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
        <h1 className={`${H1_CLASS} text-foreground`}>
          {dict.order.somethingWrong}
        </h1>
        <p className="text-muted-foreground">{dict.order.loadErrorBody}</p>
        <Button
          type="button"
          size="lg"
          onClick={() => void refetch()}
          className={PAGE_CTA}
        >
          {dict.common.tryAgain}
        </Button>
      </div>
    );
  }

  // A 404 (missing or non-owned order) is terminal; a successful response with
  // no order body is treated the same way.
  if (!order) {
    return (
      <div role="alert" className="flex flex-col items-start gap-4 py-16">
        <h1 className={`${H1_CLASS} text-foreground`}>
          {dict.order.notFoundHeading}
        </h1>
        <p className="text-muted-foreground">{dict.order.notFoundBody}</p>
        <Button asChild size="lg" className={PAGE_CTA}>
          <Link href="/">{dict.common.goHome}</Link>
        </Button>
      </div>
    );
  }

  // `notes` is generated as a loose nullable object; narrow to a display string.
  const notes = typeof order.notes === "string" ? order.notes : null;
  const retryIsPrimary = offersPaymentRetry(order.paymentStatus, order.status);

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
        hasRecentAttempt={watch.hasRecentAttempt}
        isAwaitingCallback={watch.isAwaitingCallback}
      />

      <div className="flex flex-col gap-8 lg:grid lg:grid-cols-3">
        <div className="flex flex-col gap-8 lg:col-span-2">
          <OrderItemList items={order.items} />
          <OrderAddressSummary
            shippingAddress={order.shippingAddress}
            billingAddress={order.billingAddress}
          />

          <div className="flex flex-wrap items-center gap-4">
            {/* With a declined payment the panel's «Спробувати ще раз» is the
                page's one primary; «Продовжити покупки» steps down to outline
                so the two do not compete (design-system §1, TASK-865). */}
            <Button
              asChild
              size="lg"
              variant={retryIsPrimary ? "outline" : "default"}
              className={PAGE_CTA}
            >
              <Link href="/">{dict.common.continueShopping}</Link>
            </Button>
            {/* TASK-217: the same order inside the account — timeline, ТТН,
                cancel and return live there after this one-time page. */}
            <Button asChild size="lg" variant="outline" className={PAGE_CTA}>
              <Link href={`/account/orders/${order.id}`}>
                {dict.order.viewInAccount}
              </Link>
            </Button>
            {order.status === "PENDING" && (
              <CancelOrderButton orderId={order.id} />
            )}
            {/* TASK-609: the same door as the order history, under the same
                rule — DELIVERED only (see the note there on why not SHIPPED).
                A customer arriving from the email link lands HERE, not on the
                list. Not on the guest view: a guest order has no owner for the
                customer return route to check against. */}
            {order.status === "DELIVERED" && (
              <ReturnRequestButton
                orderId={order.id}
                orderNumber={`#${order.id.slice(0, 8).toUpperCase()}`}
                items={order.items}
              />
            )}
          </div>
        </div>

        <aside className="flex flex-col gap-6 lg:col-span-1 lg:self-start">
          <OrderTotalsBreakdown
            subtotal={order.subtotal}
            addonsTotal={order.addonsTotal}
            discount={order.discount}
            discountCode={order.discountCode}
            shippingCost={order.shippingCost}
            shippingPending={orderDeliveryDetails(order).shippingCostPending}
            tax={order.tax}
            total={order.total}
            className="p-6 shadow-none"
          />

          {notes && (
            <div className="flex flex-col gap-2 rounded-card border border-border bg-card p-6">
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
