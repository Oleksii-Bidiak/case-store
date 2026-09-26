import { ApiProperty } from '@nestjs/swagger';
import { ReportPeriod } from '../report-period';
import type { SalesDay, SalesTotals } from '../sales.repository';
import { ComparedValueEntity, ReportPeriodEntity, roundMoney } from './report-common.entity';

/** One Kyiv day of the sales series (TASK-686). */
export class SalesDayEntity {
  @ApiProperty({ description: 'Kyiv calendar day', example: '2026-08-01' })
  date!: string;

  @ApiProperty({ description: 'Σ totals of the orders created that day', example: 1200 })
  sales!: number;

  @ApiProperty({ description: 'Money that went back that day', example: 300 })
  refunds!: number;

  @ApiProperty({ description: 'sales − refunds; negative on a day of refunds only', example: 900 })
  net!: number;
}

/**
 * «Продажі за період» (TASK-686, plan 188) — the three revenue lines, the
 * order count and the average order value, each with its comparison, plus the
 * daily series of the chosen period.
 *
 * The three lines answer different questions and are shown side by side on
 * purpose: **sales** is what customers paid for orders placed in the period,
 * **refunds** is what went back in the period (whatever month the order was
 * placed in), **net** is the difference. A refund in September therefore
 * lowers September's net, never August's sales — a closed month does not
 * change retroactively. The admin guide (TASK-695) explains this, because it is
 * where an operator would otherwise conclude the system made a mistake.
 *
 * Every field is plain JSON: the answer goes through the report cache, which
 * serialises it.
 */
export class SalesReportEntity {
  @ApiProperty({ type: ReportPeriodEntity })
  period!: ReportPeriodEntity;

  @ApiProperty({
    type: ComparedValueEntity,
    description: 'Σ totals of paid (incl. later refunded) orders created in the period',
  })
  sales!: ComparedValueEntity;

  @ApiProperty({
    type: ComparedValueEntity,
    description: 'Money returned in the period: refunded returns plus full refunds of payment',
  })
  refunds!: ComparedValueEntity;

  @ApiProperty({ type: ComparedValueEntity, description: 'sales − refunds; may be negative' })
  net!: ComparedValueEntity;

  @ApiProperty({ type: ComparedValueEntity, description: 'Paid orders created in the period' })
  orders!: ComparedValueEntity;

  @ApiProperty({
    type: ComparedValueEntity,
    description: 'net ÷ orders; 0 when there were no orders',
  })
  averageOrderValue!: ComparedValueEntity;

  @ApiProperty({
    type: [SalesDayEntity],
    description: 'One point per Kyiv day of the period, first to last; empty days are zeros',
  })
  daily!: SalesDayEntity[];

  static from(
    period: ReportPeriod,
    current: SalesTotals,
    previous: SalesTotals,
    daily: SalesDay[],
  ): SalesReportEntity {
    const now = derive(current);
    const before = derive(previous);
    return {
      period: ReportPeriodEntity.from(period),
      sales: ComparedValueEntity.of(now.sales, before.sales),
      refunds: ComparedValueEntity.of(now.refunds, before.refunds),
      net: ComparedValueEntity.of(now.net, before.net),
      orders: ComparedValueEntity.of(current.orders, previous.orders),
      averageOrderValue: ComparedValueEntity.of(now.averageOrderValue, before.averageOrderValue),
      daily: daily.map(({ date, sales, refunds, net }) => ({ date, sales, refunds, net })),
    };
  }
}

/**
 * Net and average of one range. The average divides the NET, not the sales
 * (owner decision): a month whose orders were half refunded did not earn the
 * gross per order. With no orders it is 0 — a refund-only month would otherwise
 * report −∞ per order.
 */
function derive({ sales, refunds, orders }: SalesTotals) {
  const net = roundMoney(sales - refunds);
  return {
    sales: roundMoney(sales),
    refunds: roundMoney(refunds),
    net,
    averageOrderValue: orders === 0 ? 0 : roundMoney(net / orders),
  };
}
