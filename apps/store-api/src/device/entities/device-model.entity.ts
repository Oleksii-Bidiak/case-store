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

  /**
   * Admin SEO/copy overrides for the compatibility landing page (TASK-490).
   * Null means "no override" — the storefront renders its generated template
   * («Чохли для iPhone 15 Pro») instead. Exposed on the PUBLIC entity on
   * purpose: the only consumer is the public landing page's `<head>`, and
   * everything in these three fields is written to be published.
   */
  @ApiProperty({
    description: 'Admin override for the compatibility landing page <title> (null = generated)',
    example: 'Чохли для iPhone 15 Pro — купити в CaseStore',
    type: String,
    nullable: true,
    required: false,
  })
  metaTitle!: string | null;

  @ApiProperty({
    description: 'Admin override for the landing page meta description (null = generated)',
    example: 'Понад 40 чохлів для iPhone 15 Pro: силікон, шкіра, MagSafe.',
    type: String,
    nullable: true,
    required: false,
  })
  metaDescription!: string | null;

  @ApiProperty({
    description: 'Admin override for the landing page lead paragraph under the H1',
    example: 'Усі чохли, що точно сідають на iPhone 15 Pro.',
    type: String,
    nullable: true,
    required: false,
  })
  description!: string | null;

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
    metaTitle?: string | null;
    metaDescription?: string | null;
    description?: string | null;
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
    // `?? null` rather than a plain copy: the mapper is also fed by narrowed
    // `select`s (and by unit-test fixtures) that predate TASK-490 and carry no
    // such key at all — an absent override and a cleared one are the same thing.
    entity.metaTitle = model.metaTitle ?? null;
    entity.metaDescription = model.metaDescription ?? null;
    entity.description = model.description ?? null;
    if (model.brand) {
      entity.brandName = model.brand.name;
    }
    return entity;
  }
}
