import { ApiProperty } from '@nestjs/swagger';

/**
 * Domain entity representing a product image.
 *
 * This is a clean domain entity — not a Prisma model.
 * Contains only the data that should be exposed to the client.
 */
export class ProductImageEntity {
  @ApiProperty({
    description: 'Image unique identifier',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  id!: string;

  @ApiProperty({ description: 'Image URL', example: 'https://example.com/images/product-1.jpg' })
  url!: string;

  @ApiProperty({
    description: 'Alt text for accessibility',
    example: 'iPhone 15 Pro clear case',
    type: String,
    nullable: true,
    required: false,
  })
  alt!: string | null;

  @ApiProperty({ description: 'Display sort order (lower = first)', example: 0 })
  sortOrder!: number;

  @ApiProperty({
    description: 'Whether this is the product’s primary (cover) image',
    example: true,
  })
  isPrimary!: boolean;

  @ApiProperty({
    description: 'Owning product ID (present on admin/management responses)',
    example: '550e8400-e29b-41d4-a716-446655440000',
    required: false,
  })
  productId?: string;

  /**
   * Create a ProductImageEntity from a Prisma product image. `productId` is
   * optional: the full-row admin queries supply it (for ownership checks), while
   * the trimmed list/detail selects omit it.
   */
  static fromPrisma(image: {
    id: string;
    url: string;
    alt: string | null;
    sortOrder: number;
    isPrimary: boolean;
    productId?: string;
  }): ProductImageEntity {
    const entity = new ProductImageEntity();
    entity.id = image.id;
    entity.url = image.url;
    entity.alt = image.alt;
    entity.sortOrder = image.sortOrder;
    entity.isPrimary = image.isPrimary;
    entity.productId = image.productId;
    return entity;
  }
}
