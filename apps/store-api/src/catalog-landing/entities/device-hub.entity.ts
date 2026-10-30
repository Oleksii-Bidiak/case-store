import { ApiProperty } from '@nestjs/swagger';
import { PublicProductEntity } from '../../product';

/**
 * The device model a hub page is about (TASK-1954) — «Все для iPhone 15 Pro».
 *
 * Flat on purpose: the hero labels the brand and links it, and the page's
 * `<title>`/description fall back from the admin's copy overrides
 * (`metaTitle`/`metaDescription`/`description`, TASK-490) to the generated text.
 */
export class DeviceHubModelEntity {
  @ApiProperty({
    description: 'Device model identifier',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  id!: string;

  @ApiProperty({ description: 'Device model display name', example: 'iPhone 15 Pro' })
  name!: string;

  @ApiProperty({ description: 'Device model slug — the hub URL segment', example: 'iphone-15-pro' })
  slug!: string;

  @ApiProperty({ description: 'Owning device brand display name', example: 'Apple' })
  brandName!: string;

  @ApiProperty({ description: 'Owning device brand slug', example: 'apple' })
  brandSlug!: string;

  @ApiProperty({
    description: 'Product-line series the model belongs to, if set',
    example: 'iPhone 15',
    type: String,
    nullable: true,
  })
  series!: string | null;

  @ApiProperty({
    description: "Admin override of the page's <title>; null → generated",
    example: null,
    type: String,
    nullable: true,
  })
  metaTitle!: string | null;

  @ApiProperty({
    description: "Admin override of the page's meta description; null → generated",
    example: null,
    type: String,
    nullable: true,
  })
  metaDescription!: string | null;

  @ApiProperty({
    description: 'Admin-written intro text for the model, if any',
    example: null,
    type: String,
    nullable: true,
  })
  description!: string | null;
}

/**
 * The category a hub group is filed under: always a TOP-LEVEL category (the
 * root of the product's own category), so the group link
 * `/catalog/<slug>/<model>` is a real compatibility landing page — the landing
 * rolls the whole subtree up (TASK-236), exactly like this group does.
 */
export class DeviceHubCategoryEntity {
  @ApiProperty({
    description: 'Category identifier',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  id!: string;

  @ApiProperty({ description: 'Category display name', example: 'Чохли' })
  name!: string;

  @ApiProperty({ description: 'Category slug', example: 'cases' })
  slug!: string;
}

/** One section of the hub: a top-level category and its first products for the model. */
export class DeviceHubGroupEntity {
  @ApiProperty({ type: DeviceHubCategoryEntity })
  category!: DeviceHubCategoryEntity;

  @ApiProperty({
    description:
      'Visible products of this category subtree compatible with the model — the same ' +
      'number the landing /catalog/<category>/<model> lists. Always ≥ 1.',
    example: 44,
  })
  productCount!: number;

  @ApiProperty({
    type: [PublicProductEntity],
    description:
      'The first products of the group (at most 8): in stock first, then newest — the ' +
      "catalogue's default order. Same card shape as GET /products/cards, including " +
      '`compatibleDeviceModelIds`.',
  })
  products!: PublicProductEntity[];
}

/**
 * «Все для <модель>» — one device model's accessories grouped by top-level
 * category (TASK-1954). A 200 means the hub exists: the model is active and at
 * least one visible product is compatible with it.
 */
export class DeviceHubEntity {
  @ApiProperty({ type: DeviceHubModelEntity })
  model!: DeviceHubModelEntity;

  @ApiProperty({
    description:
      'Visible products compatible with the model, across all groups. Each product sits ' +
      'in exactly one group, so this is the sum of the group counts. Always ≥ 1.',
    example: 128,
  })
  productCount!: number;

  @ApiProperty({
    type: [DeviceHubGroupEntity],
    description: 'Non-empty groups, ordered by category sortOrder, then name',
  })
  groups!: DeviceHubGroupEntity[];
}
