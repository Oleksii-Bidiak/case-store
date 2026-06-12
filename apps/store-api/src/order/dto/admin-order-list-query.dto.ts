import { ApiProperty } from '@nestjs/swagger';
import { IsDateString, IsOptional, IsUUID } from 'class-validator';
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
}
