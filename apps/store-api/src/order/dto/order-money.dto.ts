import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsDateString,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { MoneyEntryKind } from '@prisma/client';

/**
 * Bodies of the operator's money door (R2 step A3 — TASK-2047, TASK-2046,
 * TASK-951, TASK-2337): `POST /api/admin/orders/:orderId/money/{in,out}` and the
 * corrections under `…/money/entries/:entryId`.
 *
 * Amounts are INTEGER KOPECKS (`129900` = 1 299,00 ₴), never a float and never a
 * decimal string: the ledger is integer kopecks end to end, and an Int on the
 * wire leaves no rounding to anybody.
 *
 * `expectedUpdatedAt` is REQUIRED on every write — the order's `updatedAt` as the
 * operator's screen last read it (from `GET …/money`). It is compared with the
 * row locked by the write itself; a mismatch is 409 ORDER_STALE. Declared as an
 * ISO string for the same reason as on `UpdateOrderStatusDto`.
 */

/** The kinds an operator may record as received — never LIQPAY_PAYMENT. */
export const MANUAL_IN_KINDS = [
  MoneyEntryKind.COD_NOVA_POSHTA,
  MoneyEntryKind.PAID_AT_POINT,
  MoneyEntryKind.PAID_TO_COURIER,
  MoneyEntryKind.BANK_TRANSFER,
] as const;

/** The kinds an operator may pay out. */
export const MANUAL_OUT_KINDS = [
  MoneyEntryKind.CASH_REFUND,
  MoneyEntryKind.TRANSFER_REFUND,
  MoneyEntryKind.LIQPAY_REFUND,
] as const;

/** int4 — the ledger column's range. */
const MAX_KOP = 2_147_483_647;

const trimToNull = ({ value }: { value: unknown }) => {
  if (typeof value !== 'string') return value;
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
};

const EXPECTED_UPDATED_AT_DOC = {
  description:
    "The order's `updatedAt` as the screen last read it (from GET …/money). A stale value " +
    'is refused with 409 ORDER_STALE.',
  format: 'date-time',
  example: '2026-11-01T10:15:30.000Z',
} as const;

export class RecordMoneyInDto {
  @ApiProperty({
    description:
      "What came in. Must be one of the order's `allowedInKinds` (GET …/money): the " +
      "delivery's own hand-over kind (NP cash on delivery, paid at the pickup point, paid to " +
      'the courier) or a bank transfer. LIQPAY_PAYMENT is written only by LiqPay.',
    enum: MANUAL_IN_KINDS,
    enumName: 'MoneyInKind',
    example: MoneyEntryKind.COD_NOVA_POSHTA,
  })
  @IsIn(MANUAL_IN_KINDS)
  kind!: (typeof MANUAL_IN_KINDS)[number];

  @ApiProperty({
    description:
      'Integer kopecks, > 0. A part payment (prepayment) is fine; more than the order still ' +
      'owes needs a `note` (ORDER_MONEY_OVERPAYMENT_REASON_REQUIRED).',
    type: 'integer',
    minimum: 1,
    maximum: MAX_KOP,
    example: 129900,
  })
  @IsInt()
  @Min(1)
  @Max(MAX_KOP)
  amountKop!: number;

  @ApiProperty({
    description: 'When the money actually arrived; defaults to now, never in the future',
    required: false,
    format: 'date-time',
  })
  @IsOptional()
  @IsDateString()
  occurredAt?: string;

  @ApiProperty({
    description: 'Free text for the journal; required for an overpayment. Blank becomes null.',
    required: false,
    nullable: true,
    maxLength: 500,
    type: String,
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  @Transform(trimToNull)
  note?: string | null;

  @ApiProperty(EXPECTED_UPDATED_AT_DOC)
  @IsDateString()
  expectedUpdatedAt!: string;
}

export class RecordMoneyOutDto {
  @ApiProperty({
    description:
      'How the money goes back: cash at the point, a bank transfer, or a LiqPay refund to ' +
      'the card (needs `paymentId`; confirmed later by the LiqPay callback).',
    enum: MANUAL_OUT_KINDS,
    enumName: 'MoneyOutKind',
    example: MoneyEntryKind.CASH_REFUND,
  })
  @IsIn(MANUAL_OUT_KINDS)
  kind!: (typeof MANUAL_OUT_KINDS)[number];

  @ApiProperty({
    description:
      'Integer kopecks, > 0, at most what may go back (`returns[].owedKop` for a return, ' +
      '`outWithoutReturnMaxKop` without one, `refundablePayments[].remainingKop` for LiqPay).',
    type: 'integer',
    minimum: 1,
    maximum: MAX_KOP,
    example: 50000,
  })
  @IsInt()
  @Min(1)
  @Max(MAX_KOP)
  amountKop!: number;

  @ApiProperty({
    description:
      'The return this payout settles (needs returns:write as well). Omit for a cancelled ' +
      'order or an overpayment.',
    required: false,
    format: 'uuid',
  })
  @IsOptional()
  @IsUUID('loose')
  returnId?: string;

  @ApiProperty({
    description: 'The LiqPay payment attempt to refund — required for LIQPAY_REFUND only',
    required: false,
    format: 'uuid',
  })
  @IsOptional()
  @IsUUID('loose')
  paymentId?: string;

  @ApiProperty({
    description: 'Free text for the journal. Blank becomes null.',
    required: false,
    nullable: true,
    maxLength: 500,
    type: String,
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  @Transform(trimToNull)
  reason?: string | null;

  @ApiProperty(EXPECTED_UPDATED_AT_DOC)
  @IsDateString()
  expectedUpdatedAt!: string;
}

/** A reversal or a void: the reason is mandatory — a correction without a why is an edit. */
export class MoneyCorrectionDto {
  @ApiProperty({
    description: 'Why — required, kept on the entry and in the action log',
    maxLength: 500,
    example: 'Касир помилково вніс суму двічі',
  })
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @IsNotEmpty({ message: 'reason is required' })
  @MaxLength(500)
  reason!: string;

  @ApiProperty(EXPECTED_UPDATED_AT_DOC)
  @IsDateString()
  expectedUpdatedAt!: string;
}
