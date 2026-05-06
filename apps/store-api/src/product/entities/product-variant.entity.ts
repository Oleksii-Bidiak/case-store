import { ApiProperty } from '@nestjs/swagger';

/**
 * Domain entity representing a product variant.
 *
 * This is a clean domain entity — not a Prisma model.
 * Decimal fields (price) are converted to strings
 * to avoid floating-point precision issues in JSON serialization.
 */
export class ProductVariantEntity {
  @ApiProperty({
    description: 'Variant unique identifier',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  id!: string;

  @ApiProperty({ description: 'Variant name', example: 'Black / 6.1 inch' })
  name!: string;

  @ApiProperty({ description: 'Stock Keeping Unit', example: 'IP15-PRO-CASE-BLK', required: false })
  sku!: string | null;

  @ApiProperty({ description: 'Variant price as string', example: '34.99' })
  price!: string;

  @ApiProperty({ description: 'Available stock quantity', example: 150 })
  stock!: number;

  @ApiProperty({
    description: 'Variant attributes (color, size, etc.)',
    example: { color: 'black', size: '6.1' },
    required: false,
  })
  attributes!: unknown;

  @ApiProperty({ description: 'Whether the variant is active', example: true })
  isActive!: boolean;

  /**
   * Create a ProductVariantEntity from a Prisma product variant.
   * Converts Decimal price to string and strips out relation fields.
   */
  static fromPrisma(variant: {
    id: string;
    name: string;
    sku: string | null;
    price: { toString(): string };
    stock: number;
    attributes: unknown;
    isActive: boolean;
  }): ProductVariantEntity {
    const entity = new ProductVariantEntity();
    entity.id = variant.id;
    entity.name = variant.name;
    entity.sku = variant.sku;
    entity.price = variant.price.toString();
    entity.stock = variant.stock;
    entity.attributes = variant.attributes;
    entity.isActive = variant.isActive;
    return entity;
  }
}
