"use client";

import Link from "next/link";
import { type CartTotals } from "@/entities/cart";
import { ApplyDiscount, useAppliedDiscount } from "@/features/apply-discount";
import { formatMoney } from "@/shared/lib";
import { dict } from "@/shared/config";

interface CartSummaryProps {
  totals: CartTotals;
}

/**
 * CartSummary — the "Разом" order-totals panel: promo code (real coupons,
 * TASK-079), item subtotal, free-shipping and add-on-services lines, the payable
 * total, and the checkout CTA. The server re-validates and recomputes the coupon
 * authoritatively at order creation.
 *
 * Add-on services (TASK-174) are real and server-computed: `totals.addonsTotal`
 * is read straight off the cart. The coupon is applied to the product subtotal
 * ONLY — add-ons are never discounted (the same rule the backend enforces at
 * order creation), so the clamp below floors the DISCOUNTED SUBTOTAL at zero and
 * then adds the add-ons on top, rather than letting a coupon eat into them.
 */
export function CartSummary({ totals }: CartSummaryProps) {
  const applied = useAppliedDiscount();

  const subtotalCents = Math.round(parseFloat(totals.subtotal) * 100);
  const couponCents = applied
    ? Math.round(parseFloat(applied.amount) * 100)
    : 0;
  const addonsCents = Math.round(parseFloat(totals.addonsTotal) * 100);
  const payableCents =
    Math.max(0, subtotalCents - couponCents) + Math.max(0, addonsCents);
  const payableText = formatMoney((payableCents / 100).toFixed(2));

  return (
    <div className="rounded-[18px] border border-border bg-card p-[22px] shadow-card">
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

      {addonsCents > 0 && (
        <div className="flex justify-between py-2 text-sm text-muted-foreground">
          <span>{dict.cart.addonServicesLine}</span>
          <span className="font-mono text-foreground">
            +{formatMoney(totals.addonsTotal)}
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
