import {
  OrderStatus,
  PaymentStatus,
  DiscountType,
  ContactMessageStatus,
  type ContactMessage,
} from '@prisma/client';
import { ApiProperty } from '@nestjs/swagger';
import { UserEntity } from './user.entity';
import {
  type AdminCardOrderRow,
  type AdminCardReviewRow,
  type AdminCardCouponRow,
} from '../user-admin-card.types';

/**
 * One recent-order row on the customer card (TASK-252). `total` is exposed as a
 * plain `number` (the raw `Prisma.Decimal` is converted in `fromParts`).
 */
export class CustomerCardOrderEntity {
  @ApiProperty({ description: 'Order id', example: '550e8400-e29b-41d4-a716-446655440000' })
  id!: string;

  @ApiProperty({ description: 'Order status', enum: OrderStatus, example: OrderStatus.DELIVERED })
  status!: OrderStatus;

  @ApiProperty({
    description: 'Payment status',
    enum: PaymentStatus,
    example: PaymentStatus.PAID,
  })
  paymentStatus!: PaymentStatus;

  @ApiProperty({ description: 'Order total', example: 129.99 })
  total!: number;

  @ApiProperty({ description: 'Order creation timestamp', example: '2026-01-01T00:00:00.000Z' })
  createdAt!: Date;
}

/**
 * One product-review row on the customer card. `productName` is joined so the
 * admin sees what was reviewed without a second lookup; `isActive` is the
 * moderation state (false = pending approval).
 */
export class CustomerCardReviewEntity {
  @ApiProperty({ description: 'Review id', example: '550e8400-e29b-41d4-a716-446655440000' })
  id!: string;

  @ApiProperty({ description: 'Reviewed product id', example: 'prod-uuid-1' })
  productId!: string;

  @ApiProperty({ description: 'Reviewed product name', example: 'iPhone 15 Pro Case' })
  productName!: string;

  @ApiProperty({ description: 'Rating 1–5', example: 5 })
  rating!: number;

  @ApiProperty({
    description: 'Review comment',
    example: 'Great case!',
    required: false,
    nullable: true,
    type: String,
  })
  comment!: string | null;

  @ApiProperty({ description: 'Moderation state — true = approved/published', example: true })
  isActive!: boolean;

  @ApiProperty({ description: 'Review creation timestamp', example: '2026-01-01T00:00:00.000Z' })
  createdAt!: Date;
}

/**
 * One redeemed-coupon row on the customer card. `code`/`type`/`value` are joined
 * from the parent `Discount`; `value` is exposed as a plain `number`.
 */
export class CustomerCardCouponEntity {
  @ApiProperty({ description: 'Redemption id', example: '550e8400-e29b-41d4-a716-446655440000' })
  id!: string;

  @ApiProperty({ description: 'Discount code', example: 'SUMMER20' })
  code!: string;

  @ApiProperty({ description: 'Discount type', enum: DiscountType, example: DiscountType.PERCENT })
  type!: DiscountType;

  @ApiProperty({ description: 'Discount value (percent or fixed amount)', example: 20 })
  value!: number;

  @ApiProperty({ description: 'Order this coupon was applied to', example: 'order-uuid-1' })
  orderId!: string;

  @ApiProperty({ description: 'Redemption timestamp', example: '2026-01-01T00:00:00.000Z' })
  redeemedAt!: Date;
}

/**
 * One contact-inbox message on the customer card, matched by email (TASK-252).
 */
export class CustomerCardContactMessageEntity {
  @ApiProperty({ description: 'Message id', example: '550e8400-e29b-41d4-a716-446655440000' })
  id!: string;

  @ApiProperty({
    description: 'Message topic',
    example: 'Order question',
    required: false,
    nullable: true,
    type: String,
  })
  topic!: string | null;

  @ApiProperty({ description: 'Message body', example: 'When will my order ship?' })
  message!: string;

  @ApiProperty({
    description: 'Inbox status',
    enum: ContactMessageStatus,
    example: ContactMessageStatus.NEW,
  })
  status!: ContactMessageStatus;

  @ApiProperty({ description: 'Message creation timestamp', example: '2026-01-01T00:00:00.000Z' })
  createdAt!: Date;
}

/**
 * Raw enrichment parts assembled by `UserService.getAdminCard` and mapped into
 * the decorated entity by {@link UserAdminCardEntity.fromParts}.
 */
export interface UserAdminCardParts {
  ltv: number;
  orderCount: number;
  recentOrders: AdminCardOrderRow[];
  reviews: AdminCardReviewRow[];
  redeemedCoupons: AdminCardCouponRow[];
  contactMessages: ContactMessage[];
}

/**
 * Enriched admin "customer card" (TASK-252): the user's profile plus lifetime
 * value, order count, recent orders, reviews, redeemed coupons, and
 * email-matched contact messages. Assembled from six independent reads run in
 * parallel by the service.
 */
export class UserAdminCardEntity {
  @ApiProperty({ description: 'The customer profile', type: UserEntity })
  user!: UserEntity;

  @ApiProperty({
    description: 'Lifetime value — sum of PAID order totals (deletedAt-agnostic)',
    example: 1299.5,
  })
  ltv!: number;

  @ApiProperty({ description: 'Number of live (non-deleted) orders', example: 12 })
  orderCount!: number;

  @ApiProperty({ description: 'Most recent orders, newest first', type: [CustomerCardOrderEntity] })
  recentOrders!: CustomerCardOrderEntity[];

  @ApiProperty({ description: 'Product reviews, newest first', type: [CustomerCardReviewEntity] })
  reviews!: CustomerCardReviewEntity[];

  @ApiProperty({
    description: 'Redeemed coupons, newest first',
    type: [CustomerCardCouponEntity],
  })
  redeemedCoupons!: CustomerCardCouponEntity[];

  @ApiProperty({
    description: 'Contact-inbox messages matched by email, newest first',
    type: [CustomerCardContactMessageEntity],
  })
  contactMessages!: CustomerCardContactMessageEntity[];

  /**
   * Build a `UserAdminCardEntity` from an already-mapped `UserEntity` plus the
   * six raw enrichment reads. `Prisma.Decimal` fields (`total`, `value`) are
   * coerced to `number` via `Number(...)`.
   */
  static fromParts(user: UserEntity, parts: UserAdminCardParts): UserAdminCardEntity {
    const entity = new UserAdminCardEntity();
    entity.user = user;
    entity.ltv = parts.ltv;
    entity.orderCount = parts.orderCount;
    entity.recentOrders = parts.recentOrders.map((order) => ({
      id: order.id,
      status: order.status,
      paymentStatus: order.paymentStatus,
      total: Number(order.total),
      createdAt: order.createdAt,
    }));
    entity.reviews = parts.reviews.map((review) => ({
      id: review.id,
      productId: review.productId,
      productName: review.productName,
      rating: review.rating,
      comment: review.comment,
      isActive: review.isActive,
      createdAt: review.createdAt,
    }));
    entity.redeemedCoupons = parts.redeemedCoupons.map((coupon) => ({
      id: coupon.id,
      code: coupon.code,
      type: coupon.type,
      value: Number(coupon.value),
      orderId: coupon.orderId,
      redeemedAt: coupon.redeemedAt,
    }));
    entity.contactMessages = parts.contactMessages.map((message) => ({
      id: message.id,
      topic: message.topic,
      message: message.message,
      status: message.status,
      createdAt: message.createdAt,
    }));
    return entity;
  }
}
