import { OrderStatus, PaymentStatus, DiscountType, Prisma } from '@prisma/client';

/**
 * Internal TypeScript shapes + list-size constants for the admin customer card
 * (TASK-252). Mirrors `dashboard.types.ts`'s role exactly — plain interfaces with
 * no decorator metadata, kept separate from the Swagger-decorated entities in
 * `entities/user-admin-card.entity.ts` (which Swagger/Orval consume).
 *
 * Every field is a read aggregate/list over existing columns — no schema change.
 * The repository returns these raw shapes; the entity's `fromParts` factory maps
 * them into the decorated response (converting `Prisma.Decimal` → `number`).
 */

/** Recent orders shown inline on the card before the "view all" deep link. */
export const CUSTOMER_CARD_RECENT_ORDERS_LIMIT = 10;

/** Reviews shown inline on the card. */
export const CUSTOMER_CARD_REVIEWS_LIMIT = 20;

/** Redeemed coupons shown inline on the card. */
export const CUSTOMER_CARD_COUPONS_LIMIT = 20;

/** Contact-inbox messages (email-matched) shown inline on the card. */
export const CUSTOMER_CARD_MESSAGES_LIMIT = 20;

/**
 * A single recent-order row for the card. `total` is kept as `Prisma.Decimal`
 * here (the raw column type) and converted to `number` in the entity factory.
 */
export interface AdminCardOrderRow {
  id: string;
  status: OrderStatus;
  paymentStatus: PaymentStatus;
  total: Prisma.Decimal;
  createdAt: Date;
}

/**
 * A single review row for the card, with the product's display name joined in
 * (no second admin round-trip to resolve product names).
 */
export interface AdminCardReviewRow {
  id: string;
  productId: string;
  productName: string;
  rating: number;
  comment: string | null;
  isActive: boolean;
  createdAt: Date;
}

/**
 * A single redeemed-coupon row for the card. `code`/`type`/`value` are joined
 * from the parent `Discount`; `value` is a `Prisma.Decimal` (converted in the
 * entity factory).
 */
export interface AdminCardCouponRow {
  id: string;
  code: string;
  type: DiscountType;
  value: Prisma.Decimal;
  orderId: string;
  redeemedAt: Date;
}
