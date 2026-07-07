import { ApiProperty, OmitType } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsDateString,
  IsEnum,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
} from 'class-validator';
import { OrderStatus } from '@prisma/client';
import { OrderListQueryDto } from './order-list-query.dto';

/**
 * Query parameters for the admin order list.
 *
 * Extends the customer {@link OrderListQueryDto} (pagination) with admin-only
 * filters: an arbitrary `userId` (admins see every user's orders), an optional
 * created-at date range, and sorting.
 *
 * Unlike the customer DTO the `status` filter here is **multi-value** (TASK-250)
 * to power the lifecycle preset tabs — notably "В обробці" (CONFIRMED +
 * PROCESSING), an OR a single-value param cannot express. The customer
 * `OrderListQueryDto` / `GET /api/orders` contract is untouched: this DTO
 * `OmitType`s the narrow scalar `status` off the base and redeclares its own
 * widened `OrderStatus[]` field (a covariant property override would fail to
 * compile — `OrderStatus[]` is not a subtype of `OrderStatus`).
 */
export class AdminOrderListQueryDto extends OmitType(OrderListQueryDto, ['status'] as const) {
  @ApiProperty({
    description:
      'Filter by one or more order statuses (comma-separated). A single value ' +
      '(`PENDING`) or CSV (`CONFIRMED,PROCESSING`) are both accepted; absent means all statuses.',
    type: String,
    required: false,
    example: 'CONFIRMED,PROCESSING',
  })
  // Read the ORIGINAL query value from `obj`, not the coerced `value` argument —
  // the global ValidationPipe runs with `enableImplicitConversion: true`, which
  // may coerce the raw value before this transform runs (same defensive pattern
  // as ProductCardsQueryDto.ids / ProductListQueryDto.isActive). Returns
  // undefined when nothing remains so "no filter" still means "all statuses".
  @Transform(({ obj, key }: { obj: Record<string, unknown>; key: string }) => {
    const raw = obj[key];
    const parts = Array.isArray(raw) ? raw : [raw];
    const values = parts
      .filter((part): part is string => typeof part === 'string')
      .flatMap((part) => part.split(','))
      .map((status) => status.trim())
      .filter((status) => status !== '');
    return values.length > 0 ? values : undefined;
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(Object.keys(OrderStatus).length)
  @IsEnum(OrderStatus, { each: true })
  status?: OrderStatus[];

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
}
