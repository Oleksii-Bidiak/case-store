import { ApiProperty } from '@nestjs/swagger';
import { CatalogueFiguresEntity } from './catalogue-report.entity';
import { ReportPeriodEntity } from './report-common.entity';

/** A best seller of the period, with its comparison. `revenue` only with `analytics:revenue`. */
export class LeaderRowEntity extends CatalogueFiguresEntity {
  @ApiProperty({ example: '3f1c…' })
  productId!: string;

  @ApiProperty({ example: 'Чохол MagSafe для iPhone 16' })
  name!: string;
}

/** A published product that sold nothing in the period. */
export class OutsiderRowEntity {
  @ApiProperty({ example: '9a2b…' })
  productId!: string;

  @ApiProperty({ example: 'Скло для iPad Air' })
  name!: string;

  @ApiProperty({ description: 'Units in stock now', example: 14 })
  stock!: number;

  @ApiProperty({
    description: 'When the product was created (ISO)',
    example: '2026-03-02T10:00:00.000Z',
  })
  createdAt!: string;
}

export class OutsidersEntity {
  @ApiProperty({
    description: 'How many published products sold nothing in the period',
    example: 37,
  })
  total!: number;

  @ApiProperty({ type: [OutsiderRowEntity], description: 'The oldest of them first' })
  rows!: OutsiderRowEntity[];
}

/**
 * «Товари-лідери й аутсайдери» (TASK-688, plan 188).
 *
 * Leaders are ranked by money for a holder of `analytics:revenue` and by units
 * for everyone else (and then carry no `revenue`). Outsiders are PUBLISHED
 * products with no sale in the period — counted from what is on sale, or the
 * list would open with positions withdrawn a year ago.
 */
export class ProductsReportEntity {
  @ApiProperty({ type: ReportPeriodEntity })
  period!: ReportPeriodEntity;

  @ApiProperty({ enum: ['revenue', 'units'], description: 'What the leaders are ranked by' })
  rankedBy!: 'revenue' | 'units';

  @ApiProperty({ type: [LeaderRowEntity] })
  leaders!: LeaderRowEntity[];

  @ApiProperty({ type: OutsidersEntity })
  outsiders!: OutsidersEntity;
}
