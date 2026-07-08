import { ApiProperty } from '@nestjs/swagger';
import { OrderStatus, PaymentStatus, OrderHistoryChangeType } from '@prisma/client';
import type { OrderStatusHistoryRow } from '../order.types';

/**
 * Domain entity for a single order status/payment-status history row (TASK-251).
 *
 * A clean domain entity (not a Prisma model) surfaced by the admin timeline
 * endpoint `GET /admin/orders/:orderId/history`. `changeType` disambiguates
 * which value pair is populated: STATUS rows carry `fromStatus`/`toStatus` (the
 * payment pair is null); PAYMENT_STATUS rows carry `fromPaymentStatus`/
 * `toPaymentStatus` (the status pair is null). `changedBy` is null for
 * system-authored rows (order creation, future payment webhook).
 */
export class OrderStatusHistoryEntity {
  @ApiProperty({
    description: 'History row unique identifier',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  id!: string;

  @ApiProperty({
    description: 'Owning order ID',
    example: '550e8400-e29b-41d4-a716-446655440001',
  })
  orderId!: string;

  @ApiProperty({
    description: 'Which kind of change this row records',
    enum: OrderHistoryChangeType,
    example: OrderHistoryChangeType.STATUS,
  })
  changeType!: OrderHistoryChangeType;

  @ApiProperty({
    description:
      'Previous order status (STATUS rows only; null on the creation row and payment rows)',
    enum: OrderStatus,
    nullable: true,
    type: String,
    example: OrderStatus.PENDING,
  })
  fromStatus!: OrderStatus | null;

  @ApiProperty({
    description: 'New order status (STATUS rows only; null on payment rows)',
    enum: OrderStatus,
    nullable: true,
    type: String,
    example: OrderStatus.CONFIRMED,
  })
  toStatus!: OrderStatus | null;

  @ApiProperty({
    description: 'Previous payment status (PAYMENT_STATUS rows only; null on status rows)',
    enum: PaymentStatus,
    nullable: true,
    type: String,
    example: PaymentStatus.PENDING,
  })
  fromPaymentStatus!: PaymentStatus | null;

  @ApiProperty({
    description: 'New payment status (PAYMENT_STATUS rows only; null on status rows)',
    enum: PaymentStatus,
    nullable: true,
    type: String,
    example: PaymentStatus.PAID,
  })
  toPaymentStatus!: PaymentStatus | null;

  @ApiProperty({
    description: 'Acting user id, or null for system-authored changes (order creation, webhook)',
    type: String,
    nullable: true,
    example: '550e8400-e29b-41d4-a716-446655440002',
  })
  changedBy!: string | null;

  @ApiProperty({ description: 'When the change happened', example: '2024-01-01T00:00:00.000Z' })
  changedAt!: Date;

  /**
   * Map a repository history row to the entity (straight field mapping).
   */
  static fromPrisma(row: OrderStatusHistoryRow): OrderStatusHistoryEntity {
    const entity = new OrderStatusHistoryEntity();
    entity.id = row.id;
    entity.orderId = row.orderId;
    entity.changeType = row.changeType;
    entity.fromStatus = row.fromStatus;
    entity.toStatus = row.toStatus;
    entity.fromPaymentStatus = row.fromPaymentStatus;
    entity.toPaymentStatus = row.toPaymentStatus;
    entity.changedBy = row.changedBy;
    entity.changedAt = row.changedAt;
    return entity;
  }
}
