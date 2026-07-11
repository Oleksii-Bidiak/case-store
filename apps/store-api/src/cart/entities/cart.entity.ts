import { ApiHideProperty, ApiProperty } from '@nestjs/swagger';
import { CartItemEntity } from './cart-item.entity';
import { toCents, centsToString } from '../../addon-service';
import type { ResolvedAddon } from '../../addon-service';

/**
 * Cart totals returned alongside the cart entity.
 *
 * Designed for future extension: discount, shippingCost, tax, total
 * fields can be added when the coupon/checkout system is implemented.
 */
export class CartTotals {
  @ApiProperty({
    description: 'Sum of (price × quantity) for all items as string',
    example: '149.97',
  })
  subtotal!: string;

  @ApiProperty({
    description: 'Total number of items (sum of quantities)',
    example: 3,
  })
  itemCount!: number;

  @ApiProperty({
    description: 'Number of distinct line items',
    example: 2,
  })
  uniqueItems!: number;

  @ApiProperty({
    description:
      'Sum of the SELECTED add-on services across all lines, as string (TASK-174). Flat — an add-on is charged once per line, never multiplied by the line quantity. Reported separately from `subtotal`, and never part of the discount base (a coupon reduces the product subtotal only).',
    example: '499.00',
  })
  addonsTotal!: string;
}

/**
 * Domain entity representing a shopping cart.
 *
 * This is a clean domain entity — not a Prisma model.
 * It is returned by CartService methods and contains only
 * the data that should be exposed to the client.
 *
 * Decimal fields are converted to strings to avoid
 * floating-point precision issues in JSON serialization.
 */
export class CartEntity {
  @ApiProperty({
    description: 'Cart unique identifier',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  id!: string;

  @ApiProperty({
    description: 'Owning user ID (null for guest carts)',
    example: '550e8400-e29b-41d4-a716-446655440001',
    nullable: true,
  })
  userId!: string | null;

  /**
   * Guest cart token. Never exposed in the JSON response — it travels
   * exclusively via the HttpOnly `cartToken` cookie.
   */
  @ApiHideProperty()
  token?: string | null;

  @ApiProperty({
    description: 'Items in the cart',
    type: [CartItemEntity],
  })
  items!: CartItemEntity[];

  @ApiProperty({
    description: 'Cart totals (subtotal, item counts)',
  })
  totals!: CartTotals;

  @ApiProperty({ description: 'Creation timestamp', example: '2024-01-01T00:00:00.000Z' })
  createdAt!: Date;

  @ApiProperty({ description: 'Last update timestamp', example: '2024-01-01T00:00:00.000Z' })
  updatedAt!: Date;

  /**
   * Create a CartEntity from a Prisma Cart model with items.
   * Converts Decimal fields to strings and calculates totals.
   *
   * `resolvedAddons` maps a PRODUCT id to the add-ons that apply to it — the
   * batched resolver output the service passes in (TASK-174). Omitting it yields
   * a cart with no add-ons offered and an `addonsTotal` of "0.00", which is
   * exactly what a cart of add-on-less products looks like.
   */
  static fromPrisma(
    cart: {
      id: string;
      userId: string | null;
      token?: string | null;
      createdAt: Date;
      updatedAt: Date;
      items: Array<{
        id: string;
        productId: string;
        quantity: number;
        createdAt: Date;
        updatedAt: Date;
        addons?: Array<{ addonServiceId: string }>;
        product: {
          id: string;
          name: string;
          slug: string;
          price: { toString(): string };
          compareAtPrice: { toString(): string } | null;
          stock: number;
          isActive: boolean;
          images: Array<{ url: string }>;
        };
      }>;
    },
    resolvedAddons: Map<string, ResolvedAddon[]> = new Map(),
  ): CartEntity {
    const entity = new CartEntity();
    entity.id = cart.id;
    entity.userId = cart.userId;
    entity.items = cart.items.map((item) =>
      CartItemEntity.fromPrisma(item, resolvedAddons.get(item.productId) ?? []),
    );
    entity.totals = CartEntity.calculateTotals(cart.items, resolvedAddons);
    entity.createdAt = cart.createdAt;
    entity.updatedAt = cart.updatedAt;
    return entity;
  }

  /**
   * Calculate cart totals from raw Prisma items.
   * Uses string-based price arithmetic to avoid float precision issues.
   *
   * Price source: the product position's price (TASK-142).
   *
   * `addonsTotal` (TASK-174) sums the EFFECTIVE (resolved) price of every
   * SELECTED add-on, once per line — deliberately NOT multiplied by the line's
   * quantity (a warranty is bought for the line, not per unit; this preserves the
   * UX the front-end stub established). It is reported alongside `subtotal`, not
   * folded into it: the discount base is the product subtotal alone (plan 150,
   * owner decision 4).
   */
  private static calculateTotals(
    items: Array<{
      quantity: number;
      productId: string;
      addons?: Array<{ addonServiceId: string }>;
      product: { price: { toString(): string } };
    }>,
    resolvedAddons: Map<string, ResolvedAddon[]>,
  ): CartTotals {
    let subtotalCents = 0;
    let addonsCents = 0;
    let itemCount = 0;

    for (const item of items) {
      const priceStr = item.product.price.toString();

      // Convert "XX.YY" to cents to avoid floating-point errors
      const priceCents = Math.round(parseFloat(priceStr) * 100);
      subtotalCents += priceCents * item.quantity;
      itemCount += item.quantity;

      const available = resolvedAddons.get(item.productId) ?? [];
      const selected = new Set(CartItemEntity.selectedAddonIds(item.addons ?? [], available));
      for (const addon of available) {
        if (selected.has(addon.addonServiceId)) {
          addonsCents += toCents(addon.price);
        }
      }
    }

    // Convert back from cents to decimal string "XX.YY"
    const dollars = Math.floor(subtotalCents / 100);
    const cents = subtotalCents % 100;
    const subtotal = `${dollars}.${cents.toString().padStart(2, '0')}`;

    return {
      subtotal,
      itemCount,
      uniqueItems: items.length,
      addonsTotal: centsToString(addonsCents),
    };
  }
}
