import { ApiProperty } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { IsEnum, IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import { ReturnStatus } from '@prisma/client';

/**
 * Sortable columns of the admin returns queue (TASK-354).
 *
 * Deliberately the intersection of "a column the operator can see" and "a scalar
 * Postgres can order by": the queue also shows an item count, which lives in a
 * child table and would cost a relation-count sort for a number nobody triages by.
 *
 * `status` orders by the ReturnStatus enum's DECLARATION order — REQUESTED,
 * APPROVED, REJECTED, RECEIVED, REFUNDED — which is the lifecycle, not the
 * alphabet. That is a happy accident of how the enum was written, so it is
 * asserted here rather than left to be discovered when someone reorders it.
 */
export const RETURN_SORT_FIELDS = ['requestedAt', 'status', 'refundedAmount'] as const;
export type ReturnSortField = (typeof RETURN_SORT_FIELDS)[number];

/** Query parameters for the admin returns queue (TASK-340, sorting TASK-354). */
export class ReturnListQueryDto {
  @ApiProperty({ description: 'Filter by return status', enum: ReturnStatus, required: false })
  @IsOptional()
  @IsEnum(ReturnStatus)
  status?: ReturnStatus;

  @ApiProperty({ description: 'Page number (1-based)', required: false, default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @ApiProperty({ description: 'Items per page (max 100)', required: false, default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;

  @ApiProperty({
    description:
      'Free-text search across the return id, the order number (id prefix), the customer ' +
      "email/phone and the customer's stated reason (TASK-423). The queue had no search at " +
      'all, so an operator on the phone with a customer could only page through it.',
    required: false,
    maxLength: 120,
    example: 'ABC12345',
  })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  // Read the ORIGINAL value off `obj` (the API-wide `enableImplicitConversion`
  // guard), trim, and collapse an all-whitespace term to undefined — an empty
  // string would reach Prisma as `contains: ''`, which matches every row.
  @Transform(({ obj, key }: { obj: Record<string, unknown>; key: string }) => {
    const raw = obj[key];
    if (typeof raw !== 'string') return undefined;
    const trimmed = raw.trim();
    return trimmed === '' ? undefined : trimmed;
  })
  search?: string;

  @ApiProperty({
    description: `Sort field (${RETURN_SORT_FIELDS.join(', ')})`,
    required: false,
    default: 'requestedAt',
    example: 'requestedAt',
  })
  @IsOptional()
  @IsString()
  // Allow-listed rather than free-form: an unknown column has to come back as a
  // 400 from the boundary, not as a Prisma error the operator reads as a 500.
  @IsIn(RETURN_SORT_FIELDS, {
    message: `sortBy must be one of: ${RETURN_SORT_FIELDS.join(', ')}`,
  })
  sortBy?: ReturnSortField = 'requestedAt';

  @ApiProperty({
    description: 'Sort order (asc or desc)',
    required: false,
    default: 'desc',
    example: 'desc',
  })
  @IsOptional()
  @IsString()
  @IsIn(['asc', 'desc'], { message: 'sortOrder must be asc or desc' })
  sortOrder?: 'asc' | 'desc' = 'desc';
}
