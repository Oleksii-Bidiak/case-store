"use client";

import Link from "next/link";
import { CheckCircle2, Mail, UserPlus } from "lucide-react";
import type { OrderEntity } from "@/entities/order";
import { Button } from "@/shared/ui";
import { dict } from "@/shared/config";
import { formatMoney } from "@/shared/lib";
import { CheckoutStepIndicator } from "./checkout-step-indicator";

interface CheckoutGuestSuccessProps {
  order: OrderEntity;
  /** The address the confirmation letter was sent to. */
  email: string;
  /** Set when the order was placed but the payment handoff could not start. */
  handoffMessage?: string | null;
}

/**
 * CheckoutGuestSuccess — what a shopper without an account sees once the order
 * is in (TASK-338).
 *
 * ── Why this exists instead of a redirect ─────────────────────────────────────
 * A signed-in shopper is pushed to `/orders/[id]/confirmation`. A guest cannot
 * be: that page reads `GET /api/orders/:id`, which is behind `JwtAuthGuard` and
 * scoped to the owning user. Sending a guest there would show them a login wall
 * seconds after they placed an order — the exact barrier TASK-338 removes, moved
 * one screen later. So the success state is rendered right here, from the
 * `OrderEntity` the create call returned.
 *
 * The durable copy is the emailed link (`/orders/guest/[token]`), which is why
 * this panel names the address it went to: if that address is wrong, the shopper
 * finds out now, while a phone call can still fix it, rather than never.
 *
 * ── The account offer ─────────────────────────────────────────────────────────
 * Placed after the order and phrased as an offer, never a requirement. That
 * ordering is the point of the task: registration is a thing the shopper may
 * want, not a toll gate in front of a purchase they have already decided on.
 */
export function CheckoutGuestSuccess({
  order,
  email,
  handoffMessage,
}: CheckoutGuestSuccessProps) {
  const orderNumber = order.id.slice(0, 8).toUpperCase();

  return (
    <div className="flex flex-col gap-6">
      {/* A guest never reaches `/orders/[id]/confirmation`, so this panel is
          their step 3 — and the stepper it replaces was left showing step 2
          right up to the moment the order existed (TASK-407). */}
      <CheckoutStepIndicator current={3} />

      {/* eslint-disable-next-line tailwindcss/no-arbitrary-value -- matches the grandfathered checkout card radius this panel replaces on screen */}
      <section className="flex flex-col gap-3 rounded-[18px] border border-border bg-card p-6 shadow-card">
        <div className="flex items-center gap-3">
          <CheckCircle2 className="size-7 shrink-0 text-primary" aria-hidden />
          <h1 className="font-display text-2xl font-bold tracking-tight text-foreground">
            {dict.checkout.guest.successHeading}
          </h1>
        </div>

        <dl className="flex flex-col gap-1 text-sm">
          <div className="flex gap-2">
            <dt className="text-muted-foreground">
              {dict.checkout.guest.successNumberLabel}
            </dt>
            <dd className="font-medium text-foreground">#{orderNumber}</dd>
          </div>
          <div className="flex gap-2">
            <dt className="text-muted-foreground">
              {dict.checkout.guest.successTotal}
            </dt>
            <dd className="font-medium text-foreground">
              {formatMoney(order.total)}
            </dd>
          </div>
        </dl>

        <p className="flex items-start gap-2 text-sm text-muted-foreground">
          <Mail className="mt-0.5 size-4 shrink-0" aria-hidden />
          {dict.checkout.guest.successEmail(email)}
        </p>

        {/* Only ever shown when the provider handoff failed. It describes the
            handoff — the order is real and unpaid — and claims nothing about
            money either way. */}
        {handoffMessage && (
          <p role="alert" className="text-sm text-destructive">
            {handoffMessage}
          </p>
        )}
      </section>

      {/* eslint-disable-next-line tailwindcss/no-arbitrary-value -- matches the grandfathered checkout card radius this panel replaces on screen */}
      <section className="flex flex-col gap-3 rounded-[18px] border border-border bg-card p-6 shadow-card">
        <div className="flex items-center gap-3">
          <UserPlus className="size-5 shrink-0 text-primary" aria-hidden />
          <h2 className="font-display text-lg font-bold text-foreground">
            {dict.checkout.guest.accountOfferHeading}
          </h2>
        </div>
        <p className="text-sm text-muted-foreground">
          {dict.checkout.guest.accountOfferBody}
        </p>
        <div className="flex flex-wrap gap-3">
          <Button asChild>
            <Link href="/register">{dict.checkout.guest.accountOfferCta}</Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/">{dict.common.continueShopping}</Link>
          </Button>
        </div>
      </section>
    </div>
  );
}
