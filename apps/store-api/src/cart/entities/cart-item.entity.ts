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
 * Each cart line references a product position (TASK-142); price and stock come
 * from the product itself. `productSlug` and `imageUrl` (the product's primary
 * image, or null) let the storefront render a thumbnail and link to the PDP
 * without an extra request per line.
 */
export class CartItemEntity {
  @ApiProperty({
    description: 'Cart item unique identifier',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  id!: string;

  @ApiProperty({
    description: 'Product (position) ID this item refers to',
    example: '550e8400-e29b-41d4-a716-446655440001',
  })
  productId!: string;

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
    description: 'URL slug for the PDP link',
    example: 'iphone-15-pro-case-clear-magsafe',
  })
  productSlug!: string;

  @ApiProperty({
    description: 'Primary image URL, null when the product has no images',
    type: String,
    nullable: true,
    required: false,
  })
  imageUrl!: string | null;

  @ApiProperty({
    description: 'Unit price as string',
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
    description: 'Available stock for this position',
    example: 50,
  })
  stock!: number;

  @ApiProperty({
    description: 'Whether the product position is active',
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
    quantity: number;
    createdAt: Date;
    updatedAt: Date;
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
  }): CartItemEntity {
    const entity = new CartItemEntity();
    entity.id = item.id;
    entity.productId = item.productId;
    entity.quantity = item.quantity;
    entity.productName = item.product.name;
    entity.productSlug = item.product.slug;
    entity.imageUrl = item.product.images[0]?.url ?? null;
    entity.compareAtPrice = item.product.compareAtPrice
      ? item.product.compareAtPrice.toString()
      : null;

    const unitPriceStr = item.product.price.toString();

    entity.price = unitPriceStr;
    entity.stock = item.product.stock;
    entity.isActive = item.product.isActive;

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
