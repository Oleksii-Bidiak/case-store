"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { UserPlus } from "lucide-react";
import {
  OrderTotalsBreakdown,
  OrderDeliveryBlock,
  orderDeliveryDetails,
  useGetGuestOrder,
} from "@/entities/order";
import { useAuth } from "@/entities/session";
import { GUEST_ORDER_PLACED_PARAM } from "@/features/checkout";
import { CheckoutTelegramCard } from "@/features/telegram-connect";
import { dict, H1_CLASS } from "@/shared/config";
import { displayPhone } from "@/shared/lib/phone";
import { OrderConfirmationSkeleton } from "./order-confirmation-skeleton";
import { OrderConfirmationHeader } from "./order-confirmation-header";
import { OrderItemList } from "./order-item-list";
import { OrderBillingAddress } from "./order-billing-address";

interface GuestOrderViewProps {
  /** Opaque access token from the confirmation email. */
  token: string;
}

const primaryCta =
  "inline-block rounded-cta bg-primary px-6 py-3 font-semibold text-primary-foreground hover:opacity-90 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring";

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
 *
 * ── Straight from checkout (TASK-1999) ────────────────────────────────────────
 * Checkout replaces itself with this page (`?placed=1`) once a guest's order is
 * in, so on that arrival the page says what the old in-place panel said:
 * «Замовлення прийнято!» and the Telegram offer for this order. The account
 * offer is a banner at the top on every visit — guest orders move into the
 * account once its email is confirmed (TASK-485) — and is withheld from a
 * visitor who is already signed in.
 */
export function GuestOrderView({ token }: GuestOrderViewProps) {
  const { data, isLoading, isError } = useGetGuestOrder(token, {
    query: {
      // A bad link is a permanent answer; retrying it just delays the message.
      retry: false,
    },
  });
  const justPlaced = useSearchParams().get(GUEST_ORDER_PLACED_PARAM) === "1";
  const { isInitializing, isAuthenticated } = useAuth();
  const offerAccount = !isInitializing && !isAuthenticated;

  if (isLoading) {
    return <OrderConfirmationSkeleton />;
  }

  const order = data?.data;

  if (isError || !order) {
    return (
      <div role="alert" className="flex flex-col items-start gap-4 py-16">
        <h1 className={`${H1_CLASS} text-foreground`}>
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
        heading={justPlaced ? dict.order.guest.placedHeading : undefined}
      />

      {/* The offer, at the top but after the order is confirmed — still an
          offer, never a condition (TASK-338). */}
      {offerAccount && (
        <section className="flex items-start gap-3 rounded-card border border-primary/30 bg-primary/5 p-4">
          <UserPlus
            className="mt-0.5 size-5 shrink-0 text-primary"
            aria-hidden
          />
          <div className="flex flex-col gap-1">
            <Link
              href="/register"
              className="font-semibold text-primary underline underline-offset-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {dict.order.guest.registerBannerCta}
            </Link>
            <p className="text-sm text-muted-foreground">
              {dict.order.guest.registerBannerBody}
            </p>
          </div>
        </section>
      )}

      <div className="flex flex-col gap-8 lg:grid lg:grid-cols-3">
        <div className="flex flex-col gap-8 lg:col-span-2">
          <OrderItemList items={order.items} />
          <OrderDeliveryBlock order={order} />
          <OrderBillingAddress
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
              <p className="text-muted-foreground">
                {displayPhone(order.guest.phone)}
              </p>
            </section>
          )}

          <div className="flex flex-wrap items-center gap-4">
            <Link href="/" className={primaryCta}>
              {dict.common.continueShopping}
            </Link>
            {/* TASK-1999: the way back to an order once this link is lost. */}
            <Link
              href="/orders/status"
              className="text-sm font-medium text-primary underline underline-offset-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {dict.orderLookup.entryLink}
            </Link>
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

          {/* TASK-679, kept through TASK-1999: the success panel offered
              Telegram for this order, and this page now stands in for it. Only
              on that arrival — the card hides itself once the token is
              claimed or the bot is off. */}
          {justPlaced && order.guest?.email && (
            <CheckoutTelegramCard
              token={token}
              orderNumber={order.id.slice(0, 8).toUpperCase()}
              email={order.guest.email}
            />
          )}
        </aside>
      </div>
    </div>
  );
}
