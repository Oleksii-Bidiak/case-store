"use client";

import Link from "next/link";
import { useGetGuestOrder } from "@/entities/order";
import { dict } from "@/shared/config";
import { OrderConfirmationSkeleton } from "./order-confirmation-skeleton";
import { OrderConfirmationHeader } from "./order-confirmation-header";
import { OrderItemList } from "./order-item-list";
import { OrderAddressSummary } from "./order-address-summary";
import { OrderTotalsBreakdown } from "./order-totals-breakdown";

interface GuestOrderViewProps {
  /** Opaque access token from the confirmation email. */
  token: string;
}

const primaryCta =
  "inline-block rounded-lg bg-primary px-6 py-3 font-semibold text-primary-foreground hover:opacity-90 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring";

/**
 * GuestOrderView — a shopper without an account looking at their own order
 * (TASK-338), reached from the link in the confirmation email.
 *
 * ── Why this route has to exist ───────────────────────────────────────────────
 * Every other order route is scoped to a `userId`. Without this one a guest goes
 * blind the moment the cart cookie expires or they open the email on a different
 * device — they would have paid us and have no way to see what they bought
 * (edge case E-17). The emailed token *is* the credential: 256 bits, stored
 * server-side only as a SHA-256, valid for a bounded window.
 *
 * ── Why every failure looks the same ──────────────────────────────────────────
 * The API answers 404 both for "no such token" and "expired", deliberately
 * indistinguishable, so a guesser learns nothing from the response. This view
 * keeps that property: one message covers both, and it does not hint which.
 *
 * No auth guard, no login redirect — requiring a session here would recreate the
 * exact barrier TASK-338 removed, one step further along.
 */
export function GuestOrderView({ token }: GuestOrderViewProps) {
  const { data, isLoading, isError } = useGetGuestOrder(token, {
    query: {
      // A bad link is a permanent answer; retrying it just delays the message.
      retry: false,
    },
  });

  if (isLoading) {
    return <OrderConfirmationSkeleton />;
  }

  const order = data?.data;

  if (isError || !order) {
    return (
      <div role="alert" className="flex flex-col items-start gap-4 py-16">
        <h1 className="text-2xl font-bold text-foreground">
          {dict.order.guest.linkInvalidHeading}
        </h1>
        <p className="text-muted-foreground">
          {dict.order.guest.linkInvalidBody}
        </p>
        <Link href="/" className={primaryCta}>
          {dict.common.goHome}
        </Link>
      </div>
    );
  }

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
        <div className="flex flex-col gap-8 lg:col-span-2">
          <OrderItemList items={order.items} />
          <OrderAddressSummary
            shippingAddress={order.shippingAddress}
            billingAddress={order.billingAddress}
          />

          {/* The contact snapshot the guest typed at checkout. Shown back so they
              can spot a typo in their own phone number while it still matters. */}
          {order.guest && (
            <section className="flex flex-col gap-1 text-sm">
              <h2 className="text-xl font-semibold text-foreground">
                {dict.order.guest.contactHeading}
              </h2>
              <p className="text-foreground">{order.guest.name}</p>
              <p className="text-muted-foreground">{order.guest.email}</p>
              <p className="text-muted-foreground">{order.guest.phone}</p>
            </section>
          )}

          <div className="flex flex-wrap gap-4">
            <Link href="/" className={primaryCta}>
              {dict.common.continueShopping}
            </Link>
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

          {/* The offer, again after the fact and never as a condition. */}
          <div className="flex flex-col gap-2 rounded-lg border border-border bg-card p-6">
            <h2 className="text-lg font-semibold text-foreground">
              {dict.order.guest.accountOfferHeading}
            </h2>
            <p className="text-sm text-muted-foreground">
              {dict.order.guest.accountOfferBody}
            </p>
            <Link
              href="/register"
              className="text-sm font-medium text-primary underline underline-offset-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {dict.order.guest.accountOfferCta}
            </Link>
          </div>
        </aside>
      </div>
    </div>
  );
}
