"use client";

import Link from "next/link";
import { type CartTotals } from "@/entities/cart";
import { ApplyDiscount, useAppliedDiscount } from "@/features/apply-discount";
import { formatMoney } from "@/shared/lib";
import { dict } from "@/shared/config";

interface CartSummaryProps {
  totals: CartTotals;
  /** Selected add-on services total in UAH (stub, TASK-174). Default 0. */
  servicesTotal?: number;
}

/**
 * CartSummary — the "Разом" order-totals panel: promo code (real coupons,
 * TASK-079), item subtotal, free-shipping + add-on-services (stub) lines, the
 * payable total, and the checkout CTA. The server re-validates and recomputes
 * the coupon authoritatively at order creation. Add-on services are a front-end
 * stub and are NOT yet persisted through checkout (TASK-174).
 */
export function CartSummary({ totals, servicesTotal = 0 }: CartSummaryProps) {
  const applied = useAppliedDiscount();

  const subtotalCents = Math.round(parseFloat(totals.subtotal) * 100);
  const couponCents = applied
    ? Math.round(parseFloat(applied.amount) * 100)
    : 0;
  const serviceCents = Math.round(servicesTotal * 100);
  const payableCents = Math.max(0, subtotalCents - couponCents + serviceCents);
  const payableText = formatMoney((payableCents / 100).toFixed(2));

  return (
    <div className="rounded-[18px] border border-border bg-card p-[22px] shadow-[var(--shadow-card)]">
      <h2 className="mb-4 font-display text-[18px] font-bold text-foreground">
        {dict.cart.summaryHeading}
      </h2>

      {/* Promo code (real coupons, TASK-079). */}
      <ApplyDiscount />

      <div className="mt-2 flex justify-between py-2 text-sm text-muted-foreground">
        <span>
          {dict.cart.itemsLine} ({dict.cart.countShort(totals.itemCount)})
        </span>
        <span className="font-mono text-foreground">
          {formatMoney(totals.subtotal)}
        </span>
      </div>

      <div className="flex justify-between py-2 text-sm text-muted-foreground">
        <span>{dict.cart.deliveryLine}</span>
        <span className="font-semibold text-success">
          {dict.cart.shippingFree}
        </span>
      </div>

      {servicesTotal > 0 && (
        <div className="flex justify-between py-2 text-sm text-muted-foreground">
          <span>{dict.cart.addonServicesLine}</span>
          <span className="font-mono text-foreground">
            +{formatMoney(String(servicesTotal))}
          </span>
        </div>
      )}

      <div className="my-2.5 h-px bg-border" />

      <div className="mb-[18px] flex items-baseline justify-between">
        <span className="text-[15px] font-semibold text-foreground">
          {dict.cart.payable}
        </span>
        <span className="font-display text-[26px] font-bold text-foreground">
          {payableText}
        </span>
      </div>

      <Link
        href="/checkout"
        aria-label={dict.cart.checkoutAria}
        className="flex h-[52px] items-center justify-center rounded-[13px] bg-primary text-base font-bold text-primary-foreground transition-colors hover:bg-primary/90 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        {dict.cart.checkout}
      </Link>
      <p className="mt-3 text-center text-xs text-muted-foreground">
        {dict.cart.termsNote}
      </p>
    </div>
  );
}
