import { ApiProperty } from '@nestjs/swagger';
import { DeviceModelEntity } from '../../device/entities';

/**
 * One compatibility landing page that EXISTS — a (category × device model) pair
 * with at least one visible product (TASK-490, plan 182 F3).
 *
 * The list form: slugs (the URL `/catalog/<категорія>/<модель>` is built from
 * them) plus the two names and the count, which is everything the sitemap and
 * any future index page needs. The admin copy overrides are NOT here — a
 * sitemap does not read them, and a list of every pair in the catalogue is the
 * wrong place to ship three nullable text columns per row.
 */
export class CompatLandingPageEntity {
  @ApiProperty({
    description: 'Category identifier',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  categoryId!: string;

  @ApiProperty({ description: 'Category slug — the first URL segment', example: 'chohly' })
  categorySlug!: string;

  @ApiProperty({ description: 'Category display name', example: 'Чохли' })
  categoryName!: string;

  @ApiProperty({
    description: 'Device model identifier',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  deviceModelId!: string;

  @ApiProperty({
    description: 'Device model slug — the second URL segment',
    example: 'iphone-15-pro',
  })
  deviceSlug!: string;

  @ApiProperty({ description: 'Device model display name', example: 'iPhone 15 Pro' })
  deviceName!: string;

  @ApiProperty({
    description: 'Visible products behind this pair (category subtree × model). Always ≥ 1.',
    example: 24,
  })
  productCount!: number;
}

/**
 * The detail form, for rendering one landing page: the same pair plus the full
 * {@link DeviceModelEntity}, whose `metaTitle`/`metaDescription`/`description`
 * are the admin's overrides of the generated «Чохли для iPhone 15 Pro» copy.
 *
 * A 200 from this endpoint IS the statement "this page exists": the count is
 * computed over the very slice the page will list, so the storefront can 404 on
 * a 404 here and never render an empty landing page.
 */
export class CompatLandingDetailEntity {
  @ApiProperty({
    description: 'Category identifier',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  categoryId!: string;

  @ApiProperty({ description: 'Category slug', example: 'chohly' })
  categorySlug!: string;

  @ApiProperty({ description: 'Category display name', example: 'Чохли' })
  categoryName!: string;

  @ApiProperty({
    description: 'The compatible device model, including its admin copy overrides',
    type: DeviceModelEntity,
  })
  deviceModel!: DeviceModelEntity;

  @ApiProperty({ description: 'Visible products on this page. Always ≥ 1.', example: 24 })
  productCount!: number;
}
