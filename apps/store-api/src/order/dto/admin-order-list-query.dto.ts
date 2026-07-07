import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean, IsDateString, IsIn, IsOptional, IsString, IsUUID } from 'class-validator';
import { OrderListQueryDto } from './order-list-query.dto';

/**
 * Query parameters for the admin order list.
 *
 * Extends the customer {@link OrderListQueryDto} (status + pagination) with
 * admin-only filters: an arbitrary `userId` (admins see every user's orders)
 * and an optional created-at date range.
 */
export class AdminOrderListQueryDto extends OrderListQueryDto {
  @ApiProperty({ description: 'Filter by owning user ID', required: false, format: 'uuid' })
  @IsOptional()
  @IsUUID()
  userId?: string;

  @ApiProperty({
    description: 'Include orders created on or after this ISO date',
    required: false,
    example: '2026-01-01',
  })
  @IsOptional()
  @IsDateString()
  dateFrom?: string;

  @ApiProperty({
    description: 'Include orders created on or before this ISO date',
    required: false,
    example: '2026-12-31',
  })
  @IsOptional()
  @IsDateString()
  dateTo?: string;

  @ApiProperty({
    description: 'Sort field (createdAt, total, status)',
    required: false,
    default: 'createdAt',
    example: 'createdAt',
  })
  @IsOptional()
  @IsString()
  @IsIn(['createdAt', 'total', 'status'], {
    message: 'sortBy must be one of: createdAt, total, status',
  })
  sortBy?: string = 'createdAt';

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

  @ApiProperty({
    description:
      'Filter to active-but-unpaid ("in-transit") orders — paymentStatus != PAID AND ' +
      'status NOT IN (CANCELLED, REFUNDED). Deep-link target for the dashboard ' +
      'needs-action widget (TASK-248).',
    example: true,
    required: false,
  })
  @IsOptional()
  // Read the ORIGINAL query value from `obj`, not the `value` argument: the global
  // ValidationPipe runs with `enableImplicitConversion: true`, which coerces the
  // raw string to Boolean BEFORE this transform — and `Boolean('false')` is `true`,
  // so `?unpaidInTransit=false` would otherwise flip to `true`. Same guard as
  // ProductListQueryDto.isActive (TASK-150-B5 / TASK-230).
  @Transform(({ obj, key }: { obj: Record<string, unknown>; key: string }) => {
    const raw = obj[key];
    if (raw === true || raw === 'true') return true;
    if (raw === false || raw === 'false') return false;
    return undefined;
  })
  @IsBoolean({ message: 'unpaidInTransit must be true or false' })
  unpaidInTransit?: boolean;
}
