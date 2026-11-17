import { ApiProperty } from '@nestjs/swagger';
import { MoneyDirection, MoneyEntryKind, MoneyProviderState } from '@prisma/client';
import type { MoneyFlowEntryRow } from '../money-flow.repository';

/** One line of the «Рух коштів» register (TASK-2395). Integer kopecks. */
export class MoneyFlowEntryEntity {
  @ApiProperty()
  id!: string;

  @ApiProperty({
    description: 'When the money moved — the date the report counts it on',
    format: 'date-time',
  })
  occurredAt!: Date;

  @ApiProperty({ description: 'When it was written down', format: 'date-time' })
  createdAt!: Date;

  @ApiProperty()
  orderId!: string;

  @ApiProperty({
    description: 'Short order number (first 8 id characters, uppercased), without "#"',
    example: '0871A795',
  })
  orderNumber!: string;

  @ApiProperty({ enum: MoneyDirection, enumName: 'MoneyDirection' })
  direction!: MoneyDirection;

  @ApiProperty({ enum: MoneyEntryKind, enumName: 'MoneyEntryKind' })
  kind!: MoneyEntryKind;

  @ApiProperty({ type: 'integer', description: 'As stored: always > 0', example: 50_000 })
  amountKop!: number;

  @ApiProperty({
    type: 'integer',
    description:
      'amountKop, negative for a reversal (сторно). The direction is NOT folded in: an OUT ' +
      'payout is positive here — read it under `direction`. Σ signedKop of one direction is ' +
      'that direction’s net',
    example: -50_000,
  })
  signedKop!: number;

  @ApiProperty({ description: 'A reversal (сторно) of `reversalOfId`' })
  isReversal!: boolean;

  @ApiProperty({ type: String, nullable: true, description: 'The entry this reversal cancels' })
  reversalOfId!: string | null;

  @ApiProperty({
    enum: MoneyProviderState,
    enumName: 'MoneyProviderState',
    nullable: true,
    description: 'LiqPay refunds only: REQUESTED until the provider confirms, then CONFIRMED',
  })
  providerState!: MoneyProviderState | null;

  @ApiProperty({
    description:
      'A LiqPay refund not yet confirmed by the provider («очікує підтвердження LiqPay»); ' +
      'counted in the sums all the same',
  })
  requested!: boolean;

  @ApiProperty({ description: 'Inferred by the R2 backfill from pre-ledger labels' })
  legacy!: boolean;

  @ApiProperty({
    type: String,
    nullable: true,
    description: 'The operator who wrote it; null for LiqPay/system rows',
    example: 'Олена Коваль',
  })
  actorName!: string | null;

  @ApiProperty({ type: String, nullable: true, description: 'Note or reason' })
  reason!: string | null;

  static from(row: MoneyFlowEntryRow): MoneyFlowEntryEntity {
    return {
      ...row,
      requested: !row.isReversal && row.providerState === MoneyProviderState.REQUESTED,
    };
  }
}
