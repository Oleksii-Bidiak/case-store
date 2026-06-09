import { ApiProperty } from '@nestjs/swagger';

/**
 * Domain entity representing a single item in a shopping cart.
 *
 * This is a clean domain entity — not a Prisma model.
 * It is returned by CartService methods and contains only
 * the data that should be exposed to the client.
 *
 * Decimal fields (price, compareAtPrice, lineTotal) are converted
 * to strings to avoid floating-point precision issues.
 *
 * Price source: When a variant exists, the variant price is used.
 * Otherwise, the product price is used.
 */
export class CartItemEntity {
  @ApiProperty({
    description: 'Cart item unique identifier',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  id!: string;

  @ApiProperty({
    description: 'Product ID this item refers to',
    example: '550e8400-e29b-41d4-a716-446655440001',
  })
  productId!: string;

  @ApiProperty({
    description: 'Product variant ID (null if no variant selected)',
    example: '550e8400-e29b-41d4-a716-446655440002',
    required: false,
  })
  variantId!: string | null;

  @ApiProperty({
    description: 'Quantity of this item in the cart',
    example: 2,
  })
  quantity!: number;

  @ApiProperty({
    description: 'Product name',
    example: 'iPhone 15 Pro Case — Clear MagSafe',
  })
  productName!: string;

  @ApiProperty({
    description: 'Unit price as string (variant price if variant exists, otherwise product price)',
    example: '29.99',
  })
  price!: string;

  @ApiProperty({
    description: 'Original price for discount display (from product)',
    example: '39.99',
    required: false,
  })
  compareAtPrice!: string | null;

  @ApiProperty({
    description: 'Variant name if a variant is selected',
    example: 'Black / iPhone 15 Pro',
    required: false,
  })
  variantName!: string | null;

  @ApiProperty({
    description: 'Available stock for this item (variant stock or product-level)',
    example: 50,
  })
  stock!: number;

  @ApiProperty({
    description: 'Whether the product/variant is active',
    example: true,
  })
  isActive!: boolean;

  @ApiProperty({
    description: 'Line total as string (price × quantity)',
    example: '59.98',
  })
  lineTotal!: string;

  @ApiProperty({ description: 'Creation timestamp', example: '2024-01-01T00:00:00.000Z' })
  createdAt!: Date;

  @ApiProperty({ description: 'Last update timestamp', example: '2024-01-01T00:00:00.000Z' })
  updatedAt!: Date;

  /**
   * Create a CartItemEntity from a Prisma CartItem model with relations.
   * Converts Decimal fields to strings and computes the line total.
   *
   * Price source: variant price if variant exists, otherwise product price.
   */
  static fromPrisma(item: {
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
  }): CartItemEntity {
    const entity = new CartItemEntity();
    entity.id = item.id;
    entity.productId = item.productId;
    entity.variantId = item.variantId;
    entity.quantity = item.quantity;
    entity.productName = item.product.name;
    entity.compareAtPrice = item.product.compareAtPrice
      ? item.product.compareAtPrice.toString()
      : null;

    // Use variant price if variant exists, otherwise product price
    const unitPriceStr = item.variant
      ? item.variant.price.toString()
      : item.product.price.toString();

    entity.price = unitPriceStr;
    entity.variantName = item.variant ? item.variant.name : null;
    entity.stock = item.variant ? item.variant.stock : 0; // No variant = no stock tracking at product level
    entity.isActive = item.variant ? item.variant.isActive : item.product.isActive;

    // Calculate line total using cents arithmetic to avoid float errors
    const priceCents = Math.round(parseFloat(unitPriceStr) * 100);
    const lineTotalCents = priceCents * item.quantity;
    const dollars = Math.floor(lineTotalCents / 100);
    const cents = lineTotalCents % 100;
    entity.lineTotal = `${dollars}.${cents.toString().padStart(2, '0')}`;

    entity.createdAt = item.createdAt;
    entity.updatedAt = item.updatedAt;
    return entity;
  }
}
