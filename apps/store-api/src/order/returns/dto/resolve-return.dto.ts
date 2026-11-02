import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean, IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
import { ReturnStatus } from '@prisma/client';

/**
 * The operator's step on a return (TASK-340) — or, without a status, just the
 * operator's notes on a return of any status.
 *
 * No money here since R2 A3 (TASK-2046): what goes back is a payout on the order
 * ledger (`POST /admin/orders/:orderId/money/out` with `returnId`), and REFUNDED
 * follows from those payouts — the old `refundedAmount` is refused by the
 * global pipe (forbidNonWhitelisted).
 */
export class ResolveReturnDto {
  @ApiProperty({
    description:
      'New return status: RECEIVED. Validated against the return state machine. APPROVED and ' +
      'REJECTED are set only by a decision (POST /admin/returns/:returnId/decision) and are ' +
      'refused here with RETURN_USE_DECISION_ENDPOINT; REFUNDED is derived from the payouts ' +
      '(POST /admin/orders/:orderId/money/out) and is refused with RETURN_REFUND_DERIVED. Omit ' +
      'it to save operatorNotes alone on a return of any status — no transition, resolvedAt ' +
      'and the decision untouched; restock is then refused with RETURN_STATUS_REQUIRED.',
    enum: ReturnStatus,
    required: false,
  })
  @IsOptional()
  @IsEnum(ReturnStatus)
  status?: ReturnStatus;

  @ApiProperty({
    description: 'Operator-only notes — never shown to the customer',
    required: false,
    nullable: true,
    maxLength: 2000,
  })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  @Transform(({ value }: { value: unknown }) => {
    if (typeof value !== 'string') return value;
    const trimmed = value.trim();
    return trimmed === '' ? null : trimmed;
  })
  operatorNotes?: string | null;

  @ApiProperty({
    description:
      'Credit the returned units back to sellable stock. Only meaningful when moving to ' +
      'RECEIVED — the goods are physically back. Guarded so the same return can never be ' +
      'restocked twice.',
    required: false,
    example: true,
  })
  @IsOptional()
  // Read the ORIGINAL value from `obj`: the global ValidationPipe runs with
  // enableImplicitConversion, and Boolean('false') is true — the project's
  // standing boolean-query gotcha.
  @Transform(({ obj, key }: { obj: Record<string, unknown>; key: string }) => {
    const raw = obj[key];
    if (raw === true || raw === 'true') return true;
    if (raw === false || raw === 'false') return false;
    return undefined;
  })
  @IsBoolean({ message: 'restock must be true or false' })
  restock?: boolean;
}
