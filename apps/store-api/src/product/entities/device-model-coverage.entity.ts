import { ApiProperty } from '@nestjs/swagger';
import { CATEGORY_ICON_API_PROPERTY, type CategoryIconKey } from '../../category';

/**
 * Result of `PUT /api/admin/devices/compat/bulk` (TASK-1955). Counts what the
 * DATABASE changed, not what was asked for: an `add` of models the products already
 * have reports `updatedProducts: 0`.
 */
export class BulkDeviceCompatResultEntity {
  @ApiProperty({
    description: 'Products whose compatibility set actually changed',
    example: 3,
  })
  updatedProducts!: number;

  @ApiProperty({ description: 'Product ↔ model links created', example: 12 })
  added!: number;

  @ApiProperty({ description: 'Product ↔ model links removed', example: 0 })
  removed!: number;
}

/** The model a coverage page is about. */
export class CoverageModelEntity {
  @ApiProperty({ example: '550e8400-e29b-41d4-a716-446655440000' })
  id!: string;

  @ApiProperty({ example: 'iPhone 15 Pro' })
  name!: string;

  @ApiProperty({ example: 'iphone-15-pro' })
  slug!: string;

  @ApiProperty({ type: String, nullable: true, example: 'iPhone 15' })
  series!: string | null;

  @ApiProperty({ example: 'Apple' })
  brandName!: string;

  @ApiProperty({ description: 'Whether the model is shown on the storefront', example: true })
  isActive!: boolean;
}

/** Another active model of the same brand and series — the comparison column. */
export class CoverageSiblingEntity {
  @ApiProperty({ example: '550e8400-e29b-41d4-a716-446655440001' })
  id!: string;

  @ApiProperty({ example: 'iPhone 15 Pro Max' })
  name!: string;
}

export class CoverageStatsEntity {
  @ApiProperty({
    description: 'Products shown on the storefront that are compatible with the model',
    example: 128,
  })
  compatibleProducts!: number;

  @ApiProperty({ description: 'Of those, how many have stock > 0', example: 117 })
  inStockProducts!: number;

  @ApiProperty({
    description: 'Top-level categories where the model has 0 products and a sibling has > 0',
    example: 2,
  })
  holes!: number;
}

/** One cell of the matrix: products of a category compatible with one model. */
export class CoverageCountEntity {
  @ApiProperty({ example: '550e8400-e29b-41d4-a716-446655440000' })
  deviceModelId!: string;

  @ApiProperty({ example: 44 })
  productCount!: number;
}

/**
 * One row of the matrix: a top-level category with a count for the model and for
 * every sibling (zeros included, so the client never guesses a missing cell).
 */
export class CoverageCategoryEntity {
  @ApiProperty({ example: '550e8400-e29b-41d4-a716-446655440010' })
  id!: string;

  @ApiProperty({ example: 'Чохли' })
  name!: string;

  @ApiProperty({ example: 'chokhly' })
  slug!: string;

  @ApiProperty(CATEGORY_ICON_API_PROPERTY)
  icon!: CategoryIconKey | null;

  @ApiProperty({
    type: [CoverageCountEntity],
    description: 'The model first, then its siblings in `siblings` order',
  })
  counts!: CoverageCountEntity[];
}

/** An active product whose name mentions the model but has no compat row for it. */
export class CoverageSuspectEntity {
  @ApiProperty({ example: '550e8400-e29b-41d4-a716-446655440020' })
  id!: string;

  @ApiProperty({ example: 'Захист камери ESR для iPhone 15 Pro' })
  name!: string;

  @ApiProperty({ example: 'zakhyst-kamery-esr-iphone-15-pro' })
  slug!: string;
}

/**
 * `GET /api/admin/devices/models/:id/coverage` (TASK-1955) — the assortment of one
 * device model next to the other models of its series, so the gaps («дірки») show.
 *
 * Every count is over products a shopper can see (`publicProductSql`), rolled up to
 * the top-level category exactly as the storefront hub «Все для <модель>» groups
 * them — so the numbers here are the numbers on that page.
 */
export class DeviceModelCoverageEntity {
  @ApiProperty({ type: CoverageModelEntity })
  model!: CoverageModelEntity;

  @ApiProperty({
    type: [CoverageSiblingEntity],
    description: 'Active models of the same brand and series, excluding this one',
  })
  siblings!: CoverageSiblingEntity[];

  @ApiProperty({ type: CoverageStatsEntity })
  stats!: CoverageStatsEntity;

  @ApiProperty({
    type: [CoverageCategoryEntity],
    description: 'Top-level categories where the model or a sibling has ≥ 1 product, tree order',
  })
  categories!: CoverageCategoryEntity[];

  @ApiProperty({
    type: [CoverageSuspectEntity],
    description: 'Up to 10 active products whose name mentions the model but lack compat with it',
  })
  suspects!: CoverageSuspectEntity[];
}
