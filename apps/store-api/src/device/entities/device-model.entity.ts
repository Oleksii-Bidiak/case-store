import { ApiProperty } from '@nestjs/swagger';

/**
 * Domain entity representing a device model (TASK-190) — a specific compatible
 * device such as "iPhone 15 Pro". Clean domain entity, not a Prisma model.
 *
 * `brandName` is denormalised in (when the brand relation is loaded) so the
 * storefront picker/filter and admin list can label a model without a second
 * request.
 */
export class DeviceModelEntity {
  @ApiProperty({
    description: 'Device model unique identifier',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  id!: string;

  @ApiProperty({
    description: 'Owning device brand ID',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  deviceBrandId!: string;

  @ApiProperty({ description: 'Device model name', example: 'iPhone 15 Pro' })
  name!: string;

  @ApiProperty({ description: 'URL-friendly slug', example: 'iphone-15-pro' })
  slug!: string;

  @ApiProperty({
    description: 'Series grouping for the picker cascade (e.g. "iPhone 15")',
    example: 'iPhone 15',
    type: String,
    nullable: true,
    required: false,
  })
  series!: string | null;

  @ApiProperty({
    description: 'Release year (informational)',
    example: 2023,
    type: Number,
    nullable: true,
    required: false,
  })
  releaseYear!: number | null;

  @ApiProperty({ description: 'Whether the model is active and publicly visible', example: true })
  isActive!: boolean;

  @ApiProperty({
    description: 'Owning device brand name (when the brand relation is loaded)',
    example: 'Apple',
    required: false,
  })
  brandName?: string;

  /**
   * Build a DeviceModelEntity from a Prisma DeviceModel model. When the `brand`
   * relation is included, `brandName` is populated from it.
   */
  static fromPrisma(model: {
    id: string;
    deviceBrandId: string;
    name: string;
    slug: string;
    series: string | null;
    releaseYear: number | null;
    isActive: boolean;
    brand?: { name: string } | null;
  }): DeviceModelEntity {
    const entity = new DeviceModelEntity();
    entity.id = model.id;
    entity.deviceBrandId = model.deviceBrandId;
    entity.name = model.name;
    entity.slug = model.slug;
    entity.series = model.series;
    entity.releaseYear = model.releaseYear;
    entity.isActive = model.isActive;
    if (model.brand) {
      entity.brandName = model.brand.name;
    }
    return entity;
  }
}
