import { ApiProperty } from '@nestjs/swagger';
import { DiscountType } from '@prisma/client';
import type { Discount } from '@prisma/client';

/**
 * Domain entity representing a discount / promo code.
 *
 * A clean domain entity — not the Prisma model. `Decimal` money fields
 * (`value`, `minSpend`) are converted to strings to avoid floating-point
 * precision issues in JSON serialization, mirroring {@link OrderEntity}.
 */
export class DiscountEntity {
  @ApiProperty({
    description: 'Discount unique identifier',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  id!: string;

  @ApiProperty({ description: 'Promo code (stored uppercase)', example: 'SUMMER10' })
  code!: string;

  @ApiProperty({ description: 'Discount type', enum: DiscountType, example: DiscountType.PERCENT })
  type!: DiscountType;

  @ApiProperty({
    description: 'Discount value as string — PERCENT: 1–100; FIXED: UAH amount',
    example: '10.00',
  })
  value!: string;

  @ApiProperty({
    description: 'Minimum cart subtotal required to apply, as string (null = no minimum)',
    nullable: true,
    type: String,
    example: '500.00',
  })
  minSpend!: string | null;

  @ApiProperty({
    description: 'Global redemption cap (null = unlimited)',
    nullable: true,
    type: Number,
    example: 100,
  })
  maxRedemptions!: number | null;

  @ApiProperty({ description: 'Number of times this code has been redeemed', example: 12 })
  redeemedCount!: number;

  @ApiProperty({
    description: 'Per-user redemption cap (null = unlimited)',
    nullable: true,
    type: Number,
    example: 1,
  })
  perUserLimit!: number | null;

  @ApiProperty({
    description: 'Activation timestamp — code is invalid before this (null = always started)',
    nullable: true,
    type: String,
    example: '2026-06-01T00:00:00.000Z',
  })
  startsAt!: Date | null;

  @ApiProperty({
    description: 'Expiry timestamp — code is invalid after this (null = never expires)',
    nullable: true,
    type: String,
    example: '2026-09-01T00:00:00.000Z',
  })
  expiresAt!: Date | null;

  @ApiProperty({ description: 'Whether the code is active', example: true })
  isActive!: boolean;

  @ApiProperty({ description: 'Creation timestamp', example: '2026-06-01T00:00:00.000Z' })
  createdAt!: Date;

  @ApiProperty({ description: 'Last update timestamp', example: '2026-06-01T00:00:00.000Z' })
  updatedAt!: Date;

  /**
   * Create a DiscountEntity from a Prisma Discount model. Converts the Decimal
   * money fields to strings (`value` always; `minSpend` may be null).
   */
  static fromPrisma(discount: Discount): DiscountEntity {
    const entity = new DiscountEntity();
    entity.id = discount.id;
    entity.code = discount.code;
    entity.type = discount.type;
    entity.value = discount.value.toString();
    entity.minSpend = discount.minSpend !== null ? discount.minSpend.toString() : null;
    entity.maxRedemptions = discount.maxRedemptions;
    entity.redeemedCount = discount.redeemedCount;
    entity.perUserLimit = discount.perUserLimit;
    entity.startsAt = discount.startsAt;
    entity.expiresAt = discount.expiresAt;
    entity.isActive = discount.isActive;
    entity.createdAt = discount.createdAt;
    entity.updatedAt = discount.updatedAt;
    return entity;
  }
}

/**
 * Result of a successful discount preview: the applied code, its type, the
 * computed discount amount, and the resulting order total — all money values as
 * strings to preserve cents precision over JSON.
 */
export class DiscountPreviewEntity {
  @ApiProperty({ description: 'Applied promo code (uppercase)', example: 'SUMMER10' })
  code!: string;

  @ApiProperty({ description: 'Discount type', enum: DiscountType, example: DiscountType.PERCENT })
  type!: DiscountType;

  @ApiProperty({ description: 'Computed discount amount as string', example: '15.00' })
  amount!: string;

  @ApiProperty({ description: 'New subtotal after the discount as string', example: '135.00' })
  newTotal!: string;
}

/**
 * Public-safe projection of a discount for the storefront promo feed (TASK-179,
 * `GET /api/discounts/active`). Deliberately exposes ONLY what a shopper needs
 * to see a redeemable code — `code`, `type`, `value`, `minSpend`, `expiresAt` —
 * and NEVER the internal `id`, redemption caps/counts (`maxRedemptions`,
 * `redeemedCount`, `perUserLimit`), `startsAt`, `isActive`, or timestamps, some
 * of which are competitively/operationally sensitive.
 */
export class PublicDiscountEntity {
  @ApiProperty({ description: 'Promo code (stored uppercase)', example: 'SUMMER10' })
  code!: string;

  @ApiProperty({ description: 'Discount type', enum: DiscountType, example: DiscountType.PERCENT })
  type!: DiscountType;

  @ApiProperty({
    description: 'Discount value as string — PERCENT: 1–100; FIXED: UAH amount',
    example: '10.00',
  })
  value!: string;

  @ApiProperty({
    description: 'Minimum cart subtotal required to apply, as string (null = no minimum)',
    nullable: true,
    type: String,
    example: '500.00',
  })
  minSpend!: string | null;

  @ApiProperty({
    description: 'Expiry timestamp — code is invalid after this (null = never expires)',
    nullable: true,
    type: String,
    example: '2026-09-01T00:00:00.000Z',
  })
  expiresAt!: Date | null;

  /**
   * Project a Prisma Discount onto the public-safe shape. Converts the Decimal
   * money fields to strings (`value` always; `minSpend` may be null), mirroring
   * {@link DiscountEntity.fromPrisma}.
   */
  static fromPrisma(discount: Discount): PublicDiscountEntity {
    const entity = new PublicDiscountEntity();
    entity.code = discount.code;
    entity.type = discount.type;
    entity.value = discount.value.toString();
    entity.minSpend = discount.minSpend !== null ? discount.minSpend.toString() : null;
    entity.expiresAt = discount.expiresAt;
    return entity;
  }
}
