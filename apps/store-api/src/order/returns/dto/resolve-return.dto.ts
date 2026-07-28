import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean, IsEnum, IsOptional, IsString, Matches, MaxLength } from 'class-validator';
import { ReturnStatus } from '@prisma/client';

/**
 * The operator's decision on a return (TASK-340).
 */
export class ResolveReturnDto {
  @ApiProperty({
    description: 'New return status. Validated against the return state machine.',
    enum: ReturnStatus,
  })
  @IsEnum(ReturnStatus)
  status!: ReturnStatus;

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
      'What was actually refunded, as a decimal string. May be less than the line total — ' +
      'shipping is not always refundable and partial returns are normal.',
    required: false,
    nullable: true,
    example: '499.00',
  })
  @IsOptional()
  @IsString()
  // A decimal string rather than a number, for the same reason every money field
  // in this API is a string: a float cannot hold 0.10 and nobody notices until
  // the totals disagree by a kopiyka.
  @Matches(/^\d{1,8}(\.\d{1,2})?$/, {
    message: 'refundedAmount must be a decimal amount like "499.00"',
  })
  refundedAmount?: string | null;

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
