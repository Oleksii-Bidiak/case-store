import type { DiscountEntity } from "@/shared/api";
import { dict } from "@/shared/config";
import { formatCurrency, formatDate } from "@/shared/lib";

/** The fields a code's state and wording are computed from. */
export type DiscountStateFields = Pick<
  DiscountEntity,
  | "type"
  | "value"
  | "minSpend"
  | "maxRedemptions"
  | "redeemedCount"
  | "perUserLimit"
  | "startsAt"
  | "expiresAt"
  | "isActive"
>;

/**
 * What a code does in the cart RIGHT NOW (DiscountsProposal ПК1). `isActive`
 * alone said «активний» about EXPIRED15 a week after it stopped working; the
 * badge now reads the window too, and the global cap: a code used 100 / 100
 * times is refused by the cart however open its window. The switch wins: a
 * disabled code is «Вимкнено» whatever its dates say.
 */
export type DiscountDisplayState =
  "live" | "scheduled" | "expired" | "exhausted" | "disabled";

const instant = (iso: string | null): number | null => {
  if (!iso) return null;
  const ms = Date.parse(iso);
  return Number.isFinite(ms) ? ms : null;
};

/**
 * `now` is passed in — a query's `dataUpdatedAt` — so a render never reads the
 * clock (the same contract as the banners' display state).
 */
export function discountDisplayState(
  discount: DiscountStateFields,
  now: number,
): DiscountDisplayState {
  if (!discount.isActive) return "disabled";
  const start = instant(discount.startsAt);
  if (start !== null && start > now) return "scheduled";
  const end = instant(discount.expiresAt);
  if (end !== null && end < now) return "expired";
  if (
    discount.maxRedemptions !== null &&
    discount.redeemedCount >= discount.maxRedemptions
  ) {
    return "exhausted";
  }
  return "live";
}

/** «26.09» — the Kyiv day without the year, for the badge and a range start. */
const shortDate = (iso: string): string => formatDate(iso).slice(0, 5);

/** «Діє» · «Заплановано з 15.10» · «Закінчився 26.09» · «Вимкнено». */
export function discountStatusLabel(
  discount: DiscountStateFields,
  now: number,
): string {
  const d = dict.discounts;
  switch (discountDisplayState(discount, now)) {
    case "disabled":
      return d.statusDisabled;
    case "scheduled":
      return d.statusScheduled(shortDate(discount.startsAt as string));
    case "expired":
      return d.statusExpired(shortDate(discount.expiresAt as string));
    case "exhausted":
      return d.statusExhausted;
    default:
      return d.statusLive;
  }
}

/** The bare amount: «10%» or «500 ₴». */
export function discountAmount(
  discount: Pick<DiscountEntity, "type" | "value">,
): string {
  return discount.type === "PERCENT"
    ? `${Number(discount.value)}%`
    : formatCurrency(discount.value);
}

/** «−10%» / «−500 ₴» — the money through the one formatter (TASK-801). */
export function discountValueLabel(
  discount: Pick<DiscountEntity, "type" | "value">,
): string {
  return dict.discounts.value(discountAmount(discount));
}

/**
 * The conditions in words: «від 3 000 ₴ · 1 раз на клієнта», or «без умов».
 * The global cap is not here — it is the «Використано» column's «41 / 100».
 */
export function discountConditions(discount: DiscountStateFields): string {
  const d = dict.discounts;
  const parts: string[] = [];
  if (discount.minSpend !== null && Number(discount.minSpend) > 0) {
    parts.push(d.condMinSpend(formatCurrency(discount.minSpend)));
  }
  if (discount.perUserLimit !== null) {
    parts.push(d.condPerUser(discount.perUserLimit));
  }
  return parts.length > 0 ? parts.join(" · ") : d.condNone;
}

/**
 * The window: «без строку», «з 15.10.2026», «до 26.09.2026», or
 * «01.08 – 26.09.2026» — the start loses its year when both ends share it.
 */
export function discountPeriod(discount: DiscountStateFields): string {
  const d = dict.discounts;
  const { startsAt, expiresAt } = discount;
  if (startsAt && expiresAt) {
    const from = formatDate(startsAt);
    const to = formatDate(expiresAt);
    const sameYear = from.slice(6) === to.slice(6);
    return d.periodRange(sameYear ? from.slice(0, 5) : from, to);
  }
  if (startsAt) return d.periodFrom(formatDate(startsAt));
  if (expiresAt) return d.periodUntil(formatDate(expiresAt));
  return d.periodNone;
}
