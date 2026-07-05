import { ApiProperty } from '@nestjs/swagger';

/**
 * A device model a product is compatible with (TASK-190), exposed on the product
 * entities as `compatibleDeviceModels[]`. Flattened `brandName` so the storefront
 * can render "Apple · iPhone 15 Pro" without a second request.
 */
export class ProductCompatibleDeviceEntity {
  @ApiProperty({
    description: 'Device model ID',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  id!: string;

  @ApiProperty({ description: 'Device model name', example: 'iPhone 15 Pro' })
  name!: string;

  @ApiProperty({ description: 'Device model slug', example: 'iphone-15-pro' })
  slug!: string;

  @ApiProperty({ description: 'Owning device brand name', example: 'Apple' })
  brandName!: string;

  static fromSummary(summary: {
    id: string;
    name: string;
    slug: string;
    brandName: string;
  }): ProductCompatibleDeviceEntity {
    const entity = new ProductCompatibleDeviceEntity();
    entity.id = summary.id;
    entity.name = summary.name;
    entity.slug = summary.slug;
    entity.brandName = summary.brandName;
    return entity;
  }
}
