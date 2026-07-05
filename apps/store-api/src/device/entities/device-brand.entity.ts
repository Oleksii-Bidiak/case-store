import { ApiProperty } from '@nestjs/swagger';

/**
 * Domain entity representing a device brand (TASK-190) — the manufacturer of a
 * compatible device (Apple, Samsung, Xiaomi, …). Clean domain entity, not a
 * Prisma model. `modelCount` is populated only on admin listings.
 */
export class DeviceBrandEntity {
  @ApiProperty({
    description: 'Device brand unique identifier',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  id!: string;

  @ApiProperty({ description: 'Device brand name', example: 'Apple' })
  name!: string;

  @ApiProperty({ description: 'URL-friendly slug', example: 'apple' })
  slug!: string;

  @ApiProperty({ description: 'Whether the brand is active and publicly visible', example: true })
  isActive!: boolean;

  @ApiProperty({ description: 'Display sort order (lower = first)', example: 0 })
  sortOrder!: number;

  @ApiProperty({
    description: 'Number of device models under this brand (admin listings only)',
    example: 12,
    required: false,
  })
  modelCount?: number;

  /**
   * Build a DeviceBrandEntity from a Prisma DeviceBrand model.
   * Strips relation fields; `modelCount` is passed separately for admin lists.
   */
  static fromPrisma(
    brand: {
      id: string;
      name: string;
      slug: string;
      isActive: boolean;
      sortOrder: number;
    },
    modelCount?: number,
  ): DeviceBrandEntity {
    const entity = new DeviceBrandEntity();
    entity.id = brand.id;
    entity.name = brand.name;
    entity.slug = brand.slug;
    entity.isActive = brand.isActive;
    entity.sortOrder = brand.sortOrder;
    if (modelCount !== undefined) {
      entity.modelCount = modelCount;
    }
    return entity;
  }
}
