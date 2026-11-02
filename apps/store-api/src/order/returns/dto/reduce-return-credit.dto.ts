import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsInt, IsNotEmpty, IsString, Max, Min, MaxLength } from 'class-validator';

/**
 * Body of `PATCH /api/admin/returns/:returnId/credit` (R2 A3, TASK-2046): lower
 * what is owed back on a refund return — an incomplete set, a scratched case.
 *
 * Reduce-only: never above the computed value (the lines' value less their
 * promo share) and never below what was already paid out. The reason is
 * required and stays on the return (`creditReason`).
 */
export class ReduceReturnCreditDto {
  @ApiProperty({
    description:
      'The new «до повернення» in integer kopecks — at most the computed value, at least what ' +
      'was already paid out on this return',
    type: 'integer',
    minimum: 0,
    example: 30000,
  })
  @IsInt()
  @Min(0)
  @Max(2_147_483_647)
  creditKop!: number;

  @ApiProperty({
    description: 'Why the amount is lowered — required',
    maxLength: 500,
    example: 'Повернули без зарядного блока',
  })
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @IsNotEmpty({ message: 'reason is required' })
  @MaxLength(500)
  reason!: string;
}
