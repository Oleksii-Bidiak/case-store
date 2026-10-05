import type { DiscountEntity } from "@/entities/discount";
import { toKyivDateInput } from "@/shared/lib";
import type { DiscountFormInput } from "./discount-schema";

/**
 * Map a fetched discount onto the form's string-based input shape — the edit
 * form's seed, and (without the code) the «Дублювати» draft's.
 */
export function discountToFormInput(
  discount: DiscountEntity,
): DiscountFormInput {
  // The KYIV calendar day (TASK-795). `iso.slice(0, 10)` was the UTC day: a
  // window starting at 00:00 Kyiv on the 1st is 21:00 UTC on the 31st, so the
  // form reopened a day early and re-saving it moved the start back a day.
  const toDateInput = (iso: string | null): string =>
    iso ? toKyivDateInput(iso) : "";

  return {
    code: discount.code,
    type: discount.type,
    value: String(Number(discount.value)),
    minSpend:
      discount.minSpend !== null ? String(Number(discount.minSpend)) : "",
    maxRedemptions:
      discount.maxRedemptions !== null ? String(discount.maxRedemptions) : "",
    perUserLimit:
      discount.perUserLimit !== null ? String(discount.perUserLimit) : "",
    startsAt: toDateInput(discount.startsAt),
    expiresAt: toDateInput(discount.expiresAt),
    isActive: discount.isActive,
    showOnPromoPage: discount.showOnPromoPage,
  };
}

/**
 * «Дублювати» (DiscountsProposal ПК1): the terms, the window and the promo-page
 * switch carry over; the code does not — it is unique, and the operator picks
 * (or generates) the new one. The copy starts SWITCHED OFF: a copy of a live
 * code would otherwise go live the moment it is saved, before anyone has
 * looked at its window.
 */
export function duplicateDiscountInput(
  discount: DiscountEntity,
): DiscountFormInput {
  return { ...discountToFormInput(discount), code: "", isActive: false };
}
