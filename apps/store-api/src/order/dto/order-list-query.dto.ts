import { ApiProperty } from '@nestjs/swagger';
import { Transform, TransformFnParams, Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsEnum, IsInt, IsOptional, Max, Min } from 'class-validator';
import { OrderStatus } from '@prisma/client';

/**
 * `@Transform` body for a multi-value `status` query filter, shared by this DTO
 * and `AdminOrderListQueryDto` so the two lists cannot parse it differently.
 *
 * Accepts a single value (`PENDING`), a comma-separated value
 * (`CONFIRMED,PROCESSING`) and repeated params (`?status=a&status=b`, which
 * Express hands over as an array), trims, and drops empty segments. Returns
 * undefined when nothing remains so "no filter" still means "all statuses".
 * Unknown values are passed through untouched — rejecting them is the job of
 * `@IsEnum(OrderStatus, { each: true })`, which answers 400.
 *
 * Reads the ORIGINAL query value from `obj`, not the coerced `value` argument —
 * the global ValidationPipe runs with `enableImplicitConversion: true`, which
 * may coerce the raw value before this transform runs (same defensive pattern
 * as ProductCardsQueryDto.ids / ProductListQueryDto.isActive).
 */
export const toOrderStatusList = ({ obj, key }: TransformFnParams): string[] | undefined => {
  const raw = (obj as Record<string, unknown>)[key];
  const parts = Array.isArray(raw) ? raw : [raw];
  const values = parts
    .filter((part): part is string => typeof part === 'string')
    .flatMap((part) => part.split(','))
    .map((status) => status.trim())
    .filter((status) => status !== '');
  return values.length > 0 ? values : undefined;
};

/**
 * Query parameters for listing the authenticated user's orders.
 * Supports an optional status filter and pagination.
 *
 * The `status` filter is **multi-value** (TASK-217) so a storefront tab that
 * spans several statuses is one request — «Активні» (PENDING, CONFIRMED,
 * PROCESSING, SHIPPED) and «Скасовані» (CANCELLED, REFUNDED). A single
 * `?status=PENDING` still works and arrives as a one-element array.
 */
export class OrderListQueryDto {
  @ApiProperty({
    description:
      'Filter by one or more order statuses — repeated params (`status=PENDING&status=SHIPPED`) ' +
      'or one comma-separated value (`status=PENDING,SHIPPED`); absent means all statuses.',
    enum: OrderStatus,
    isArray: true,
    required: false,
  })
  @Transform(toOrderStatusList)
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(Object.keys(OrderStatus).length)
  @IsEnum(OrderStatus, { each: true })
  status?: OrderStatus[];

  @ApiProperty({ description: 'Page number (1-based)', required: false, default: 1, minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @ApiProperty({
    description: 'Items per page',
    required: false,
    default: 10,
    minimum: 1,
    maximum: 100,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;
}
