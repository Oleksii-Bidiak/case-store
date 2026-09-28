import { ApiProperty } from '@nestjs/swagger';
import { ComparedValueEntity, ReportPeriodEntity } from './report-common.entity';

/**
 * How categories and brands were attributed: by the catalogue as it is NOW
 * (owner decision B-8 №6). The screen turns this into «за нинішньою структурою
 * каталогу» — part of the acceptance of TASK-687, because a sum by today's
 * categories over last year's orders is otherwise read as history.
 */
export const CATALOGUE_BASIS = 'current-catalogue' as const;

/** The sold figures of one row: units and orders always, money only with `analytics:revenue`. */
export class CatalogueFiguresEntity {
  @ApiProperty({ type: ComparedValueEntity, description: 'Units sold' })
  units!: ComparedValueEntity;

  @ApiProperty({ type: ComparedValueEntity, description: 'Orders with at least one such line' })
  orders!: ComparedValueEntity;

  @ApiProperty({
    type: ComparedValueEntity,
    required: false,
    description:
      'Gross line amount (price × quantity, before order discounts, shipping and refunds). ' +
      'ABSENT — not null — without analytics:revenue: the API cuts the money, not the screen.',
  })
  revenue?: ComparedValueEntity;
}

export class CategoryReportRowEntity extends CatalogueFiguresEntity {
  @ApiProperty({ example: 'b3c1…' })
  categoryId!: string;

  @ApiProperty({ example: 'Чохли' })
  name!: string;

  @ApiProperty({
    description:
      'The «directly in this category» row of an expansion: products placed on the expanded ' +
      'category itself rather than in one of its children',
  })
  direct!: boolean;

  @ApiProperty({ description: 'Has child categories, so it can be expanded' })
  hasChildren!: boolean;
}

/**
 * «Продажі за категоріями» (TASK-687): a row per root category — or per child
 * of `parentId` when expanding — summed over the whole subtree.
 */
export class CategoryReportEntity {
  @ApiProperty({ type: ReportPeriodEntity })
  period!: ReportPeriodEntity;

  @ApiProperty({ enum: [CATALOGUE_BASIS], enumName: 'CatalogueBasis' })
  basis!: typeof CATALOGUE_BASIS;

  @ApiProperty({
    type: String,
    nullable: true,
    description: 'The expanded category; null for the root rows',
  })
  parentId!: string | null;

  @ApiProperty({ type: [CategoryReportRowEntity] })
  rows!: CategoryReportRowEntity[];
}

export class BrandReportRowEntity extends CatalogueFiguresEntity {
  @ApiProperty({
    type: String,
    nullable: true,
    description: 'null is «Без бренду» — products without a brand',
  })
  brandId!: string | null;

  @ApiProperty({ type: String, nullable: true, example: 'Apple' })
  name!: string | null;
}

/** «Продажі за брендами» (TASK-687): a flat row per brand that sold in either range. */
export class BrandReportEntity {
  @ApiProperty({ type: ReportPeriodEntity })
  period!: ReportPeriodEntity;

  @ApiProperty({ enum: [CATALOGUE_BASIS], enumName: 'CatalogueBasis' })
  basis!: typeof CATALOGUE_BASIS;

  @ApiProperty({ type: [BrandReportRowEntity] })
  rows!: BrandReportRowEntity[];
}
