import { ApiProperty } from '@nestjs/swagger';
import { MoneyDirection, MoneyEntryKind } from '@prisma/client';
// eslint-disable-next-line local/no-deep-module-import -- cycle: order barrel > order.module > order.repository > dashboard barrel > dashboard.module > reports.module > money-flow-report.service > this file
import { IN_KINDS, OUT_KINDS } from '../../../order/order-money';
import type { MoneyBalances, MoneyFlowKindTotals } from '../money-flow.repository';
import { ReportPeriod } from '../report-period';
import { ComparedValueEntity, ReportPeriodEntity } from './report-common.entity';

/** Every ledger kind, in the order the report always lists them: IN kinds, then OUT kinds. */
const REPORT_KINDS: readonly MoneyEntryKind[] = [...IN_KINDS, ...OUT_KINDS];

/** One ledger kind's money in the chosen period (TASK-2395). Integer kopecks. */
export class MoneyFlowKindRowEntity {
  @ApiProperty({ enum: MoneyEntryKind, enumName: 'MoneyEntryKind' })
  kind!: MoneyEntryKind;

  @ApiProperty({ enum: MoneyDirection, enumName: 'MoneyDirection' })
  direction!: MoneyDirection;

  @ApiProperty({
    type: 'integer',
    description: 'Σ of the ordinary entries dated in the period (reversals not subtracted)',
    example: 1_250_000,
  })
  grossKop!: number;

  @ApiProperty({
    type: 'integer',
    description: 'Σ of the reversals (сторно) dated in the period, as a positive number',
    example: 50_000,
  })
  reversedKop!: number;

  @ApiProperty({
    type: 'integer',
    description: 'grossKop − reversedKop; negative when a period holds only a reversal',
    example: 1_200_000,
  })
  netKop!: number;

  @ApiProperty({ type: 'integer', description: 'Entries dated in the period, reversals included' })
  count!: number;

  @ApiProperty({
    type: 'integer',
    description:
      'Part of grossKop LiqPay has not confirmed yet (provider_state REQUESTED) — counted in ' +
      'the sums all the same; 0 for every kind but LIQPAY_REFUND',
    example: 0,
  })
  requestedKop!: number;
}

/** The four money totals of the period, each compared with the previous range. */
export class MoneyFlowTotalsEntity {
  @ApiProperty({ type: ComparedValueEntity, description: 'Money in, net of reversals (kopecks)' })
  inKop!: ComparedValueEntity;

  @ApiProperty({ type: ComparedValueEntity, description: 'Money out, net of reversals (kopecks)' })
  outKop!: ComparedValueEntity;

  @ApiProperty({ type: ComparedValueEntity, description: 'inKop − outKop (kopecks)' })
  netKop!: ComparedValueEntity;

  @ApiProperty({
    type: ComparedValueEntity,
    description: 'Of outKop, LiqPay refunds still awaiting confirmation (kopecks)',
  })
  requestedOutKop!: ComparedValueEntity;
}

/** Orders on one side of the balance and their money. */
export class MoneyBalanceEntity {
  @ApiProperty({ type: 'integer', example: 3 })
  orders!: number;

  @ApiProperty({ type: 'integer', description: 'Kopecks, always ≥ 0', example: 450_000 })
  kop!: number;
}

/** Who owes whom right now — a snapshot, not part of the period. */
export class MoneyBalancesEntity {
  @ApiProperty({
    type: MoneyBalanceEntity,
    description:
      'Customers owe the shop: DELIVERED orders with a positive balance (the order list’s ' +
      'hasDebt=true)',
  })
  debt!: MoneyBalanceEntity;

  @ApiProperty({
    type: MoneyBalanceEntity,
    description:
      'The shop owes customers: orders of any status with a negative balance (the order ' +
      'list’s owedToCustomer=true); kop is the positive amount owed',
  })
  owedToCustomer!: MoneyBalanceEntity;
}

/**
 * «Рух коштів» (TASK-2395) — what the order money ledger says came in and went
 * out in a period, by kind, with the as-of-now debts and overpayments.
 *
 * Unlike «Продажі» this is CASH, not sales: a COD payment collected in
 * September is September's money whatever month the order was placed in. Every
 * amount is integer kopecks (`*Kop`), never a float.
 */
export class MoneyFlowReportEntity {
  @ApiProperty({ type: ReportPeriodEntity })
  period!: ReportPeriodEntity;

  @ApiProperty({
    type: [MoneyFlowKindRowEntity],
    description: 'Always 8 rows: the IN kinds, then the OUT kinds, zero rows included',
  })
  rows!: MoneyFlowKindRowEntity[];

  @ApiProperty({ type: MoneyFlowTotalsEntity })
  totals!: MoneyFlowTotalsEntity;

  @ApiProperty({ type: MoneyBalancesEntity })
  balances!: MoneyBalancesEntity;

  static from(
    period: ReportPeriod,
    current: MoneyFlowKindTotals[],
    previous: MoneyFlowKindTotals[],
    balances: MoneyBalances,
  ): MoneyFlowReportEntity {
    const now = totalsOf(current);
    const before = totalsOf(previous);
    return {
      period: ReportPeriodEntity.from(period),
      rows: REPORT_KINDS.map((kind) => rowOf(kind, current)),
      totals: {
        inKop: ComparedValueEntity.of(now.inKop, before.inKop),
        outKop: ComparedValueEntity.of(now.outKop, before.outKop),
        netKop: ComparedValueEntity.of(now.inKop - now.outKop, before.inKop - before.outKop),
        requestedOutKop: ComparedValueEntity.of(now.requestedOutKop, before.requestedOutKop),
      },
      balances: {
        debt: { ...balances.debt },
        owedToCustomer: { ...balances.owedToCustomer },
      },
    };
  }
}

function rowOf(kind: MoneyEntryKind, sums: MoneyFlowKindTotals[]): MoneyFlowKindRowEntity {
  const found = sums.find((row) => row.kind === kind);
  return {
    kind,
    direction: IN_KINDS.includes(kind) ? MoneyDirection.IN : MoneyDirection.OUT,
    grossKop: found?.grossKop ?? 0,
    reversedKop: found?.reversedKop ?? 0,
    netKop: found?.netKop ?? 0,
    count: found?.count ?? 0,
    requestedKop: found?.requestedKop ?? 0,
  };
}

function totalsOf(sums: MoneyFlowKindTotals[]) {
  let inKop = 0;
  let outKop = 0;
  let requestedOutKop = 0;
  for (const row of sums) {
    if (row.direction === MoneyDirection.IN) {
      inKop += row.netKop;
    } else {
      outKop += row.netKop;
      requestedOutKop += row.requestedKop;
    }
  }
  return { inKop, outKop, requestedOutKop };
}
