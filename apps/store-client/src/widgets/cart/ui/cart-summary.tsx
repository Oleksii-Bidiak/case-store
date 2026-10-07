"use client";

import { useRef } from "react";
import Link from "next/link";
import { type CartTotals } from "@/entities/cart";
import { ApplyDiscount, useAppliedDiscount } from "@/features/apply-discount";
import {
  RemoveUnavailableButton,
  type RemoveUnavailableResult,
} from "@/features/cart-remove-unavailable";
import { formatMoney } from "@/shared/lib";
import { dict } from "@/shared/config";
import { MobilePayBar } from "@/shared/ui";
import { useFocusWhenReady } from "../model/use-focus-when-ready";

interface CartSummaryProps {
  totals: CartTotals;
  /**
   * At least one line is withdrawn from sale (`CartItemEntity.isActive === false`,
   * TASK-403). The order would be rejected server-side, so the checkout CTA is
   * blocked here and the panel says which action unblocks it.
   */
  hasUnavailableItems?: boolean;
  /**
   * How many withdrawn LINES the cart holds (TASK-657) — the N in «Прибрати N
   * недоступних товарів». Lines, not units.
   */
  unavailableCount?: number;
  /**
   * Remove every withdrawn line at once (TASK-657). Owned by `CartView`, which
   * knows the line ids; omitted → no bulk button, the rows still remove one by
   * one.
   */
  onRemoveUnavailable?: () => Promise<RemoveUnavailableResult>;
  /** The bulk removal is running. */
  isRemovingUnavailable?: boolean;
}

/**
 * CartSummary — the "Разом" order-totals panel: promo code (real coupons,
 * TASK-079), item subtotal, delivery (priced at checkout — TASK-881) and
 * add-on-services lines, the payable total, and the checkout CTA. The server
 * re-validates and recomputes the coupon authoritatively at order creation.
 *
 * Add-on services (TASK-174) are real and server-computed: `totals.addonsTotal`
 * is read straight off the cart. The coupon is applied to the product subtotal
 * ONLY — add-ons are never discounted (the same rule the backend enforces at
 * order creation), so the clamp below floors the DISCOUNTED SUBTOTAL at zero and
 * then adds the add-ons on top, rather than letting a coupon eat into them.
 */
export function CartSummary({
  totals,
  hasUnavailableItems = false,
  unavailableCount = 0,
  onRemoveUnavailable,
  isRemovingUnavailable = false,
}: CartSummaryProps) {
  const applied = useAppliedDiscount();

  // After the bulk removal unblocks checkout, focus lands on the now-live CTA —
  // the button that was pressed unmounts with the last withdrawn line (TASK-657).
  const checkoutRef = useRef<HTMLAnchorElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const focusAfterCleanup = useFocusWhenReady(
    !hasUnavailableItems,
    checkoutRef,
    headingRef,
  );

  const removeUnavailable = async () => {
    if (!onRemoveUnavailable) return;
    focusAfterCleanup.arm();
    const result = await onRemoveUnavailable();
    if (result.failed > 0 || result.removed === 0 || !result.refreshed) {
      focusAfterCleanup.disarm();
    }
  };

  const subtotalCents = Math.round(parseFloat(totals.subtotal) * 100);
  const couponCents = applied
    ? Math.round(parseFloat(applied.amount) * 100)
    : 0;
  const addonsCents = Math.round(parseFloat(totals.addonsTotal) * 100);
  const payableCents =
    Math.max(0, subtotalCents - couponCents) + Math.max(0, addonsCents);
  const payableText = formatMoney((payableCents / 100).toFixed(2));

  return (
    <div className="rounded-card border border-border bg-card p-[22px] shadow-card">
      {/* `tabIndex={-1}`: the focus fallback after the bulk removal (TASK-657). */}
      <h2
        ref={headingRef}
        tabIndex={-1}
        className="mb-4 font-display text-lg font-bold text-foreground focus:outline-none"
      >
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

      {/* Delivery is priced at checkout, never here (TASK-881): Nova Poshta
          charges its own tariff for the chosen city, pickup is free, the
          courier has a flat price — the cart knows none of that yet, so it
          says when the price appears instead of promising «Безкоштовно». */}
      <div className="flex justify-between gap-4 py-2 text-sm text-muted-foreground">
        <span>{dict.cart.deliveryLine}</span>
        <span className="text-right text-foreground">
          {dict.cart.deliveryAtCheckout}
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

      {/* Below md the CTA rides in the fixed «До сплати» bar (TASK-864); from
          md up the bar dissolves and the CTA renders here, in the card — one
          primary at every width. */}
      {hasUnavailableItems ? (
        // A real disabled <button>, not a styled link: a link with
        // `aria-disabled` still navigates on Enter, and /checkout would then
        // fail on an order the API refuses to create.
        <>
          <MobilePayBar label={dict.cart.payable} amount={payableText}>
            <button
              type="button"
              disabled
              aria-describedby="cart-checkout-blocked"
              className="flex h-11 w-full cursor-not-allowed items-center justify-center rounded-cta bg-muted text-sm font-bold text-muted-foreground md:h-13 md:text-base"
            >
              {dict.cart.checkout}
            </button>
          </MobilePayBar>
          <p
            id="cart-checkout-blocked"
            className="mt-3 text-center text-xs font-medium text-destructive"
          >
            {dict.cart.checkoutBlocked}
          </p>
          {/* The remedy right under the reason, inside the card — never in the
              fixed mobile bar, which carries only the primary (TASK-657). */}
          {onRemoveUnavailable && unavailableCount > 0 && (
            <RemoveUnavailableButton
              count={unavailableCount}
              pending={isRemovingUnavailable}
              onClick={() => void removeUnavailable()}
            />
          )}
        </>
      ) : (
        <>
          <MobilePayBar label={dict.cart.payable} amount={payableText}>
            <Link
              ref={checkoutRef}
              href="/checkout"
              aria-label={dict.cart.checkoutAria}
              className="flex h-11 w-full items-center justify-center rounded-cta bg-primary px-4 text-sm font-bold text-primary-foreground transition-colors hover:bg-primary/90 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 md:h-13 md:text-base"
            >
              {dict.cart.checkout}
            </Link>
          </MobilePayBar>
          <p className="mt-3 text-center text-xs text-muted-foreground">
            {dict.cart.termsNote}
          </p>
        </>
      )}
    </div>
  );
}
