"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/entities/session";
import { useGetOrder } from "@/entities/order";
import { CancelOrderButton } from "@/features/cancel-order";
import { dict } from "@/shared/config";
import { OrderConfirmationSkeleton } from "./order-confirmation-skeleton";
import { OrderConfirmationHeader } from "./order-confirmation-header";
import { OrderItemList } from "./order-item-list";
import { OrderAddressSummary } from "./order-address-summary";
import { OrderTotalsBreakdown } from "./order-totals-breakdown";

interface OrderConfirmationViewProps {
  orderId: string;
}

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

  const { data, isLoading, isError, error, refetch } = useGetOrder(orderId, {
    query: { enabled: isAuthenticated },
  });

  // Redirect unauthenticated visitors to login (once init has settled).
  useEffect(() => {
    if (!isInitializing && !isAuthenticated) {
      router.replace(`/login?redirect=/orders/${orderId}/confirmation`);
    }
  }, [isInitializing, isAuthenticated, orderId, router]);

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

      <div className="flex flex-col gap-8 lg:grid lg:grid-cols-3">
        <section className="flex flex-col gap-8 lg:col-span-2">
          <OrderItemList items={order.items} />
          <OrderAddressSummary
            shippingAddress={order.shippingAddress}
            billingAddress={order.billingAddress}
          />
        </section>

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

      <div className="flex flex-wrap gap-4">
        <Link href="/" className={primaryCta}>
          {dict.common.continueShopping}
        </Link>
        {order.status === "PENDING" && <CancelOrderButton orderId={order.id} />}
      </div>
    </div>
  );
}
