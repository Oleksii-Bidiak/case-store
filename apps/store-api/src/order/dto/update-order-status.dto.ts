import { ApiProperty } from '@nestjs/swagger';
import { IsEnum } from 'class-validator';
import { OrderStatus } from '@prisma/client';

/**
 * DTO for updating an order's status.
 *
 * Used internally by the payment webhook handler (TASK-034) and the admin
 * order-management endpoints (TASK-041). Not exposed on a public Phase 3
 * endpoint — customers may only cancel a PENDING order.
 */
export class UpdateOrderStatusDto {
  @ApiProperty({ description: 'Target order status', enum: OrderStatus })
  @IsEnum(OrderStatus)
  status!: OrderStatus;
}
