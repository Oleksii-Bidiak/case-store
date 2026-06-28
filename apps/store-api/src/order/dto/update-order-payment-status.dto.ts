import { ApiProperty } from '@nestjs/swagger';
import { IsEnum } from 'class-validator';
import { PaymentStatus } from '@prisma/client';

/**
 * DTO for updating an order's payment status (TASK-151).
 *
 * Used by the admin order-management endpoint
 * `PATCH /api/admin/orders/:orderId/payment-status`. Payment status is managed
 * independently of the order status — setting it here never changes the order
 * status (and vice versa).
 */
export class UpdateOrderPaymentStatusDto {
  @ApiProperty({ description: 'Target payment status', enum: PaymentStatus })
  @IsEnum(PaymentStatus)
  paymentStatus!: PaymentStatus;
}
