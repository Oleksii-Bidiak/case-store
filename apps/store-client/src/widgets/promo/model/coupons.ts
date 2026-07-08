import { dict } from "@/shared/config";
import type { PublicDiscountEntity } from "@/entities/discount";

/**
 * View model for a promo "coupon of the week" ticket card. Built at render time
 * from the live public active-discounts feed (TASK-179) — no more hardcoded
 * array; every code shown resolves against the real Discount catalog and is
 * currently redeemable.
 */
export interface PromoCouponView {
  /** The promo code, shown on the copy button and copied to the clipboard. */
  code: string;
  /** Big accent amount, e.g. "−5%" or "−500". */
  amount: string;
  /** Small unit under the amount, e.g. "на все" / "гривень". */
  unit: string;
  title: string;
  condition: string;
}

/** Format a discount's condition line from its minSpend / expiry, else a generic fallback. */
function couponCondition(discount: PublicDiscountEntity): string {
  if (discount.minSpend !== null) {
    return dict.promo.couponMinSpend(String(Number(discount.minSpend)));
  }
  if (discount.expiresAt) {
    const date = new Date(discount.expiresAt).toLocaleDateString("uk-UA", {
      day: "numeric",
      month: "long",
    });
    return dict.promo.couponExpires(date);
  }
  return dict.promo.couponGeneric;
}

/**
 * Map a `PublicDiscountEntity` onto the ticket-card view model. PERCENT →
 * `−{value}%` / "на все"; FIXED → `−{value}` / "гривень". `Number(value)`
 * normalizes the decimal string ("10.00" → 10) for a clean display amount.
 */
export function mapDiscountToCoupon(
  discount: PublicDiscountEntity,
): PromoCouponView {
  const amount = Number(discount.value);
  const isPercent = discount.type === "PERCENT";
  return {
    code: discount.code,
    amount: isPercent ? `−${amount}%` : `−${amount}`,
    unit: isPercent ? dict.promo.couponUnitPercent : dict.promo.couponUnitFixed,
    title: dict.promo.couponTitle,
    condition: couponCondition(discount),
  };
}
