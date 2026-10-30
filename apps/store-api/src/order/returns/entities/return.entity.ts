import { ApiProperty } from '@nestjs/swagger';
import { ReturnDecision, ReturnStatus } from '@prisma/client';
import type { ReturnItemRow, ReturnWithItems } from '../return.types';

/** One line of a return, with the product it points at (TASK-340). */
export class ReturnItemEntity {
  @ApiProperty({ description: 'Return line id', format: 'uuid' })
  id!: string;

  @ApiProperty({ description: 'The order line being returned', format: 'uuid' })
  orderItemId!: string;

  @ApiProperty({ description: 'How many units are coming back', example: 1 })
  quantity!: number;

  @ApiProperty({ description: 'Product name at the time of the return', example: 'iPhone 15 Case' })
  productName!: string;

  @ApiProperty({
    description: 'Unit price paid for this line, as a string',
    example: '499.00',
    nullable: true,
    type: String,
  })
  price!: string | null;

  static fromPrisma(row: ReturnItemRow): ReturnItemEntity {
    const entity = new ReturnItemEntity();
    entity.id = row.id;
    entity.orderItemId = row.orderItemId;
    entity.quantity = row.quantity;
    entity.productName = row.orderItem?.product.name ?? '';
    entity.price = row.orderItem ? row.orderItem.price.toString() : null;
    return entity;
  }
}

/**
 * Domain entity for a return request (TASK-340).
 *
 * `operatorNotes` is opt-in for the same reason `Order.internalNotes` is: the
 * repository selects the whole row, so the field is present in the object on
 * every read, and a forgotten flag must cost the admin a field rather than show
 * the customer what the shop wrote about them.
 */
export class ReturnEntity {
  @ApiProperty({ description: 'Return id', format: 'uuid' })
  id!: string;

  @ApiProperty({ description: 'The order these goods came from', format: 'uuid' })
  orderId!: string;

  @ApiProperty({ description: 'Return status', enum: ReturnStatus })
  status!: ReturnStatus;

  @ApiProperty({
    description: 'Why the customer is returning, in their own words',
    type: String,
    nullable: true,
  })
  reason!: string | null;

  @ApiProperty({
    description: 'Operator-only notes. Present ONLY on admin responses.',
    type: String,
    required: false,
    nullable: true,
  })
  operatorNotes?: string | null;

  @ApiProperty({ description: 'When the customer asked', example: '2026-07-28T10:15:30.000Z' })
  requestedAt!: Date;

  @ApiProperty({
    description: 'When the operator decided',
    type: String,
    format: 'date-time',
    nullable: true,
  })
  resolvedAt!: Date | null;

  @ApiProperty({
    description:
      'When these units were credited back to sellable stock; null while they have not been. ' +
      'Mirrors Order.restockedAt and guards against a double credit.',
    type: String,
    format: 'date-time',
    nullable: true,
  })
  restockedAt!: Date | null;

  @ApiProperty({
    description: 'What was actually refunded, as a string; null until money moves',
    type: String,
    nullable: true,
    example: '499.00',
  })
  refundedAmount!: string | null;

  /**
   * Who opened the request (TASK-469).
   *
   * Admin-only for the same reason `operatorNotes` is: on a return the shop filed
   * for a customer this is a MEMBER OF STAFF, and an internal account id is not
   * something a customer response should carry. The operator, on the other hand,
   * needs it — "the customer asked" and "we opened it on their behalf" are
   * different facts about the same row, and a queue that cannot tell them apart
   * cannot be audited.
   */
  @ApiProperty({
    description:
      'Account that opened the request — the customer from their own page, an operator ' +
      'when the shop filed it for them, null for rows predating the column. Present ONLY on ' +
      'admin responses.',
    type: String,
    format: 'uuid',
    required: false,
    nullable: true,
  })
  createdByUserId?: string | null;

  /*
   * The decision (TASK-1961, TASK-2044). Admin-only for now: the customer
   * projection gains decision, reason and date with TASK-2044's customer part
   * (plan, R1-API step A4), and never gains the author.
   */

  @ApiProperty({
    description:
      'The current decision; null while nobody has decided. Present ONLY on admin responses.',
    enum: ReturnDecision,
    enumName: 'ReturnDecision',
    required: false,
    nullable: true,
  })
  decision?: ReturnDecision | null;

  @ApiProperty({
    description:
      'Why — the reason the customer is shown. Null on legacy (pre-B-12) decisions and on ' +
      'approvals given without one. Present ONLY on admin responses.',
    type: String,
    required: false,
    nullable: true,
  })
  decisionReason?: string | null;

  @ApiProperty({
    description: 'When the current decision was taken. Present ONLY on admin responses.',
    type: String,
    format: 'date-time',
    required: false,
    nullable: true,
  })
  decidedAt?: Date | null;

  @ApiProperty({
    description:
      'Account that took the current decision; null for legacy decisions and deleted ' +
      'accounts. Present ONLY on admin responses.',
    type: String,
    format: 'uuid',
    required: false,
    nullable: true,
  })
  decidedById?: string | null;

  @ApiProperty({ description: 'Lines coming back', type: [ReturnItemEntity] })
  items!: ReturnItemEntity[];

  static fromPrisma(
    row: ReturnWithItems,
    options: { includeInternal?: boolean } = {},
  ): ReturnEntity {
    const entity = new ReturnEntity();
    entity.id = row.id;
    entity.orderId = row.orderId;
    entity.status = row.status;
    entity.reason = row.reason;
    if (options.includeInternal) {
      entity.operatorNotes = row.operatorNotes;
      entity.createdByUserId = row.createdByUserId;
      entity.decision = row.decision;
      entity.decisionReason = row.decisionReason;
      entity.decidedAt = row.decidedAt;
      entity.decidedById = row.decidedById;
    }
    entity.requestedAt = row.requestedAt;
    entity.resolvedAt = row.resolvedAt;
    entity.restockedAt = row.restockedAt;
    entity.refundedAmount = row.refundedAmount ? row.refundedAmount.toString() : null;
    entity.items = row.items.map((item) => ReturnItemEntity.fromPrisma(item));
    return entity;
  }
}
