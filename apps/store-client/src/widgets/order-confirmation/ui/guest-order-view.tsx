"use client";

import { useId, type ReactNode } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { UserPlus } from "lucide-react";
import {
  OrderTotalsBreakdown,
  OrderDeliveryBlock,
  orderDeliveryDetails,
  useGetGuestOrder,
} from "@/entities/order";
import { GuestOrderReturnHistory } from "@/entities/return";
import { useAuth } from "@/entities/session";
import { GUEST_ORDER_PLACED_PARAM } from "@/features/checkout";
import { ReturnRequestButton } from "@/features/return-request";
import { CheckoutTelegramCard } from "@/features/telegram-connect";
import type { SiteContactSettingsEntity } from "@/shared/api/generated/models";
import { dict, H1_CLASS } from "@/shared/config";
import { RETURN_POLICY } from "@/shared/config/return-policy";
import { displayPhone } from "@/shared/lib/phone";
import { OrderConfirmationSkeleton } from "./order-confirmation-skeleton";
import { OrderConfirmationHeader } from "./order-confirmation-header";
import { OrderItemList } from "./order-item-list";
import { OrderBillingAddress } from "./order-billing-address";

/** The shop's support contacts, as the footer shows them. */
export type GuestOrderContact = Pick<
  SiteContactSettingsEntity,
  "phone" | "email" | "workingHours"
>;

interface GuestOrderViewProps {
  /** Opaque access token from the confirmation email. */
  token: string;
  /**
   * The admin-managed support contacts (`fetchSiteContactSettings`, read by
   * the page); `null` / absent falls back to the footer's defaults.
   */
  contact?: GuestOrderContact | null;
}

const textLink =
  "font-medium text-primary underline underline-offset-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring";

/**
 * «Як повернути товар» (TASK-1965): the return door for an order with no
 * account behind it, and the shop's contacts for anything the dialog does not
 * cover. The contacts are the footer's — the same source and the same
 * fallbacks — so a guest never sees a number the rest of the site does not.
 */
function GuestReturnHelp({
  contact,
  children,
}: {
  contact?: GuestOrderContact | null;
  children: ReactNode;
}) {
  const titleId = useId();
  const phone = contact?.phone ?? dict.footer.contactPhone;
  const email = contact?.email ?? dict.footer.contactEmail;
  const hours = contact?.workingHours ?? dict.footer.contactHours;
  return (
    <section
      aria-labelledby={titleId}
      className="flex flex-col items-start gap-3 rounded-card border border-border bg-card p-6 text-sm"
    >
      <h2 id={titleId} className="text-xl font-semibold text-foreground">
        {dict.order.guest.returnHeading}
      </h2>
      <p className="text-muted-foreground">
        {dict.order.guest.returnBody(RETURN_POLICY.days)}
      </p>
      {children}
      <p className="text-muted-foreground">{dict.order.guest.returnContacts}</p>
      <ul className="flex flex-col gap-1 text-foreground">
        <li>
          <a href={`tel:${phone.replace(/\s+/g, "")}`} className={textLink}>
            {phone}
          </a>
        </li>
        <li>
          <a href={`mailto:${email}`} className={textLink}>
            {email}
          </a>
        </li>
        <li className="text-muted-foreground">{hours}</li>
      </ul>
    </section>
  );
}

const primaryCta =
  "inline-block rounded-cta bg-primary px-6 py-3 font-semibold text-primary-foreground transition-interactive hover:bg-primary-hover hover:shadow-card focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-solid focus-visible:outline-ring active:scale-98 active:bg-primary active:shadow-none motion-reduce:active:scale-100";

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
 *
 * ── Returns (TASK-1965, B-12 тема 1.8) ────────────────────────────────────────
 * The token is the authorisation for returns too: a guest — or a shopper who
 * ordered by phone — files a request with the account's dialog through the
 * guest adapter, sees each request's status and decision here, and gets the
 * shop's contacts. Only once the order has loaded, so a bad link still ends in
 * the one not-found view and asks the returns endpoint nothing.
 */
export function GuestOrderView({ token, contact }: GuestOrderViewProps) {
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
          {/* TASK-1965: what became of each return request — status, the
              decision and its reason. Nothing for an order without any. */}
          <GuestOrderReturnHistory
            token={token}
            className="rounded-card border border-border bg-card p-6"
          />
          {/* DELIVERED only — the account's rule (TASK-373: a parcel still in
              transit is not something to file a return about). */}
          {order.status === "DELIVERED" && (
            <GuestReturnHelp contact={contact}>
              <ReturnRequestButton
                source={{ kind: "guest", token }}
                orderNumber={`#${order.id.slice(0, 8).toUpperCase()}`}
                items={order.items}
              />
            </GuestReturnHelp>
          )}
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
