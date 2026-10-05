import { DiscountType, Prisma } from '@prisma/client';

/**
 * The discount a promo code resolved to, as {@link DiscountService.computeDiscount}
 * hands it out of the module (TASK-827). Only the fields a caller acts on: the
 * order flow passes `id` to `redeem` and stores `code` on the order; the preview
 * echoes `code` and `type`. The caps, counters and validity window stay inside
 * the discount module — they are what `computeDiscount` has already checked.
 */
export interface AppliedDiscount {
  id: string;
  code: string;
  type: DiscountType;
}

/**
 * One redemption of a discount by a user, with the parent discount's
 * `code`/`type`/`value` joined in (TASK-827). Read by the admin customer card
 * through {@link DiscountService.listUserRedemptions}, which used to query
 * `discountRedemption` from the user module directly.
 *
 * `value` stays a `Prisma.Decimal`: the card's entity factory converts it, and
 * the response must not change because the read moved modules.
 * `redeemedAt` is `DiscountRedemption.createdAt`.
 */
export interface UserDiscountRedemption {
  id: string;
  code: string;
  type: DiscountType;
  value: Prisma.Decimal;
  orderId: string;
  redeemedAt: Date;
}
