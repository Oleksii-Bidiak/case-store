import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, Max, Min } from 'class-validator';
import { OrderStatus } from '@prisma/client';

/**
 * Query parameters for listing the authenticated user's orders.
 * Supports an optional status filter and pagination.
 */
export class OrderListQueryDto {
  @ApiProperty({ description: 'Filter by order status', enum: OrderStatus, required: false })
  @IsOptional()
  @IsEnum(OrderStatus)
  status?: OrderStatus;

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
