import { ApiProperty } from '@nestjs/swagger';

/**
 * Domain entity representing a product brand / manufacturer (TASK-189).
 *
 * Clean domain entity (not a Prisma model) returned by BrandService methods.
 * Distinct from the compatible-device brand (plan 111) — this is who made the
 * accessory (e.g. "Spigen").
 */
export class BrandEntity {
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
    description: 'Brand logo URL (absolute or storefront-relative)',
    example: 'https://example.com/logos/spigen.svg',
    type: String,
    nullable: true,
    required: false,
  })
  logo!: string | null;

  @ApiProperty({
    description: 'Whether the brand is active and visible in the store',
    example: true,
  })
  isActive!: boolean;

  @ApiProperty({ description: 'Creation timestamp', example: '2026-07-01T00:00:00.000Z' })
  createdAt!: Date;

  @ApiProperty({ description: 'Last update timestamp', example: '2026-07-01T00:00:00.000Z' })
  updatedAt!: Date;

  /**
   * Create a BrandEntity from a Prisma Brand model.
   */
  static fromPrisma(brand: {
    id: string;
    name: string;
    slug: string;
    logo: string | null;
    isActive: boolean;
    createdAt: Date;
    updatedAt: Date;
  }): BrandEntity {
    const entity = new BrandEntity();
    entity.id = brand.id;
    entity.name = brand.name;
    entity.slug = brand.slug;
    entity.logo = brand.logo;
    entity.isActive = brand.isActive;
    entity.createdAt = brand.createdAt;
    entity.updatedAt = brand.updatedAt;
    return entity;
  }
}
