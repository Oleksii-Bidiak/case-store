/**
 * Static "coupon of the week" cards for the promo page. There is no public
 * discount-list endpoint yet (only per-code preview + admin CRUD), so these are
 * curated marketing codes — copy-to-clipboard is real, but the codes are not
 * guaranteed to resolve against the Discount catalog until TASK-179 wires a
 * public active-discounts feed. Brand-localized (VOLTA → MobileStore).
 */
export interface PromoCoupon {
  /** The promo code, shown on the copy button and copied to the clipboard. */
  code: string;
  /** Big accent amount, e.g. "−5%" or "−500". */
  amount: string;
  /** Small unit under the amount, e.g. "на все" / "гривень". */
  unit: string;
  title: string;
  condition: string;
}

export const PROMO_COUPONS: PromoCoupon[] = [
  {
    code: "MOBILE5",
    amount: "−5%",
    unit: "на все",
    title: "Перше замовлення",
    condition: "Мінімальна сума 1 000 ₴",
  },
  {
    code: "PLUS500",
    amount: "−500",
    unit: "гривень",
    title: "На аксесуари",
    condition: "При покупці від 3 000 ₴",
  },
  {
    code: "SOUND10",
    amount: "−10%",
    unit: "на аудіо",
    title: "Навушники та колонки",
    condition: "Діє до кінця тижня",
  },
];
