import { ApiProperty } from '@nestjs/swagger';

/**
 * Domain entity representing a product.
 *
 * This is a clean domain entity — not a Prisma model.
 * It is returned by ProductService methods and contains only
 * the data that should be exposed to the client.
 *
 * Decimal fields (price, compareAtPrice) are converted to strings
 * to avoid floating-point precision issues in JSON serialization.
 * Relation fields (variants, images, reviews, orderItems, cartItems)
 * are EXCLUDED from the base entity.
 */
export class ProductEntity {
  @ApiProperty({
    description: 'Product unique identifier',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  id!: string;

  @ApiProperty({ description: 'Product name', example: 'iPhone 15 Pro Case — Clear MagSafe' })
  name!: string;

  @ApiProperty({ description: 'URL-friendly slug', example: 'iphone-15-pro-case-clear-magsafe' })
  slug!: string;

  @ApiProperty({
    description: 'Product description (markdown)',
    example: 'Premium clear case...',
    required: false,
  })
  description!: string | null;

  @ApiProperty({
    description: 'Product price as string (avoids float precision)',
    example: '29.99',
  })
  price!: string;

  @ApiProperty({
    description: 'Original price for discount display',
    example: '39.99',
    required: false,
  })
  compareAtPrice!: string | null;

  @ApiProperty({ description: 'Stock Keeping Unit', example: 'IP15-PRO-CASE-CLR', required: false })
  sku!: string | null;

  @ApiProperty({
    description: 'Category ID the product belongs to',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  categoryId!: string;

  @ApiProperty({ description: 'Whether the product is active', example: true })
  isActive!: boolean;

  @ApiProperty({ description: 'Creation timestamp', example: '2024-01-01T00:00:00.000Z' })
  createdAt!: Date;

  @ApiProperty({ description: 'Last update timestamp', example: '2024-01-01T00:00:00.000Z' })
  updatedAt!: Date;

  /**
   * Create a ProductEntity from a Prisma Product model.
   * Converts Decimal fields to strings and strips out relation fields.
   */
  static fromPrisma(product: {
    id: string;
    name: string;
    slug: string;
    description: string | null;
    price: { toString(): string };
    compareAtPrice: { toString(): string } | null;
    sku: string | null;
    categoryId: string;
    isActive: boolean;
    createdAt: Date;
    updatedAt: Date;
  }): ProductEntity {
    const entity = new ProductEntity();
    entity.id = product.id;
    entity.name = product.name;
    entity.slug = product.slug;
    entity.description = product.description;
    entity.price = product.price.toString();
    entity.compareAtPrice = product.compareAtPrice ? product.compareAtPrice.toString() : null;
    entity.sku = product.sku;
    entity.categoryId = product.categoryId;
    entity.isActive = product.isActive;
    entity.createdAt = product.createdAt;
    entity.updatedAt = product.updatedAt;
    return entity;
  }
}
