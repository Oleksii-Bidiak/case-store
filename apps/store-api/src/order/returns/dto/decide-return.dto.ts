import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
import { ReturnDecision } from '@prisma/client';

/**
 * The operator's decision on a return (TASK-1961, TASK-2044 — B-12 theme 1.1).
 *
 * One request, several possible outcomes. The reason is CUSTOMER-FACING, unlike
 * `operatorNotes`; whether it is required depends on the return's current state
 * (a refusal, or a change of an earlier decision), so the service enforces it.
 */
export class DecideReturnDto {
  @ApiProperty({
    description:
      'The outcome: REFUND, REPLACEMENT or REPAIR approve the return (or re-open a refused ' +
      'one); REJECT refuses it.',
    enum: ReturnDecision,
    enumName: 'ReturnDecision',
    example: ReturnDecision.REFUND,
  })
  @IsEnum(ReturnDecision)
  decision!: ReturnDecision;

  @ApiProperty({
    description:
      'Why — shown to the customer. Required on REJECT and on any change of a decision ' +
      'already made. Trimmed; blank becomes null.',
    required: false,
    nullable: true,
    maxLength: 1000,
    type: String,
  })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  @Transform(({ value }: { value: unknown }) => {
    if (typeof value !== 'string') return value;
    const trimmed = value.trim();
    return trimmed === '' ? null : trimmed;
  })
  reason?: string | null;
}
