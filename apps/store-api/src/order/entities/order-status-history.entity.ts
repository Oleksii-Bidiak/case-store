import { ApiProperty } from '@nestjs/swagger';
import {
  OrderStatus,
  PaymentStatus,
  OrderHistoryChangeType,
  OrderHistoryNote,
} from '@prisma/client';
import type { OrderHistoryActorRow, OrderStatusHistoryRow } from '../order.types';

/**
 * Who authored a history row (TASK-1975) — admin responses only.
 *
 * `name` is the first and last name as stored, falling back to the readable
 * email (a soft-deleted account's `originalEmail`, TASK-104): staff accounts are
 * often created with an email alone, and an empty name reads as "nobody". Same
 * rule as the returns card's actor.
 */
export class OrderHistoryActorEntity {
  @ApiProperty({ description: 'Account id', format: 'uuid' })
  id!: string;

  @ApiProperty({
    description: 'First and last name as stored; the email when the account has no name',
    example: 'Олена Коваль',
  })
  name!: string;

  static from(row: OrderHistoryActorRow | null | undefined): OrderHistoryActorEntity | null {
    if (!row) return null;
    const entity = new OrderHistoryActorEntity();
    entity.id = row.id;
    const name = [row.firstName, row.lastName]
      .map((part) => part?.trim())
      .filter(Boolean)
      .join(' ');
    entity.name = name || (row.originalEmail ?? row.email);
    return entity;
  }
}

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

  @ApiProperty({
    description:
      'A flag on the row for an event the operator must see (TASK-932 / TASK-788): ' +
      'PAID_AFTER_CANCEL on a payment row — the money arrived after the order was cancelled; ' +
      'SHIPPED_UNPAID on a status row — shipped while the online payment was unconfirmed; ' +
      'PAYMENT_EVENT_REFUSED on a payment row — a provider event asked for a move the shop refused ' +
      '(the row stays current → current; the asked-for status is in rejectedPaymentStatus, TASK-621). ' +
      'Null on an ordinary row.',
    enum: OrderHistoryNote,
    enumName: 'OrderHistoryNote',
    nullable: true,
    type: String,
    example: null,
  })
  note!: OrderHistoryNote | null;

  @ApiProperty({
    description:
      'TASK-621: on a PAYMENT_EVENT_REFUSED row, the payment status the provider event asked for ' +
      'and the shop refused. Null on every other row, and on refusals recorded before the column ' +
      'existed (those read from = to with no note).',
    enum: PaymentStatus,
    nullable: true,
    type: String,
    example: null,
  })
  rejectedPaymentStatus!: PaymentStatus | null;

  @ApiProperty({ description: 'When the change happened', example: '2024-01-01T00:00:00.000Z' })
  changedAt!: Date;

  @ApiProperty({
    description:
      'TASK-1975: the account behind changedBy, so the timeline can say who changed it. ' +
      'Null for a system row and for an id that matches no account; a soft-deleted account is ' +
      'still named.',
    type: OrderHistoryActorEntity,
    nullable: true,
  })
  actor!: OrderHistoryActorEntity | null;

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
    entity.note = row.note ?? null;
    entity.rejectedPaymentStatus = row.rejectedPaymentStatus ?? null;
    entity.changedAt = row.changedAt;
    entity.actor = OrderHistoryActorEntity.from(row.actor);
    return entity;
  }
}
