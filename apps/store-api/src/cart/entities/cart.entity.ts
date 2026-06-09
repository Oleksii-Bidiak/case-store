import { ApiProperty } from '@nestjs/swagger';
import { CartItemEntity } from './cart-item.entity';

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
    description: 'Owning user ID',
    example: '550e8400-e29b-41d4-a716-446655440001',
  })
  userId!: string;

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
   */
  static fromPrisma(cart: {
    id: string;
    userId: string;
    createdAt: Date;
    updatedAt: Date;
    items: Array<{
      id: string;
      productId: string;
      variantId: string | null;
      quantity: number;
      createdAt: Date;
      updatedAt: Date;
      product: {
        id: string;
        name: string;
        price: { toString(): string };
        compareAtPrice: { toString(): string } | null;
        isActive: boolean;
      };
      variant: {
        id: string;
        name: string;
        price: { toString(): string };
        stock: number;
        isActive: boolean;
      } | null;
    }>;
  }): CartEntity {
    const entity = new CartEntity();
    entity.id = cart.id;
    entity.userId = cart.userId;
    entity.items = cart.items.map((item) => CartItemEntity.fromPrisma(item));
    entity.totals = CartEntity.calculateTotals(cart.items);
    entity.createdAt = cart.createdAt;
    entity.updatedAt = cart.updatedAt;
    return entity;
  }

  /**
   * Calculate cart totals from raw Prisma items.
   * Uses string-based price arithmetic to avoid float precision issues.
   *
   * Price source: variant price if variant exists, otherwise product price.
   */
  private static calculateTotals(
    items: Array<{
      quantity: number;
      product: { price: { toString(): string } };
      variant: { price: { toString(): string } } | null;
    }>,
  ): CartTotals {
    let subtotalCents = 0;
    let itemCount = 0;

    for (const item of items) {
      const priceStr = item.variant ? item.variant.price.toString() : item.product.price.toString();

      // Convert "XX.YY" to cents to avoid floating-point errors
      const priceCents = Math.round(parseFloat(priceStr) * 100);
      subtotalCents += priceCents * item.quantity;
      itemCount += item.quantity;
    }

    // Convert back from cents to decimal string "XX.YY"
    const dollars = Math.floor(subtotalCents / 100);
    const cents = subtotalCents % 100;
    const subtotal = `${dollars}.${cents.toString().padStart(2, '0')}`;

    return {
      subtotal,
      itemCount,
      uniqueItems: items.length,
    };
  }
}
