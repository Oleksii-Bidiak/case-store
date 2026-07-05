import { ApiProperty } from '@nestjs/swagger';

/**
 * Domain entity representing a product brand summary (TASK-189).
 *
 * Clean domain entity — not a Prisma model. Nested on product list/detail
 * responses so the storefront can show the manufacturer and link back to the
 * brand-filtered catalog. Same shape convention as {@link ProductCategoryEntity}
 * plus the optional `logo`.
 */
export class ProductBrandEntity {
  @ApiProperty({
    description: 'Brand unique identifier',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  id!: string;

  @ApiProperty({ description: 'Brand name', example: 'Spigen' })
  name!: string;

  @ApiProperty({ description: 'URL-friendly slug', example: 'spigen' })
  slug!: string;

  @ApiProperty({
    description: 'Brand logo URL',
    example: 'https://example.com/logos/spigen.svg',
    type: String,
    nullable: true,
    required: false,
  })
  logo!: string | null;

  /**
   * Create a ProductBrandEntity from a Prisma brand relation.
   */
  static fromPrisma(brand: {
    id: string;
    name: string;
    slug: string;
    logo: string | null;
  }): ProductBrandEntity {
    const entity = new ProductBrandEntity();
    entity.id = brand.id;
    entity.name = brand.name;
    entity.slug = brand.slug;
    entity.logo = brand.logo;
    return entity;
  }
}
