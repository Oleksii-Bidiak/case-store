import { ApiProperty } from '@nestjs/swagger';
import {
  RepairResult,
  ReturnChannel,
  ReturnDecision,
  ReturnOutcome,
  ReturnRepairStep,
  ReturnStatus,
} from '@prisma/client';
import type {
  ReturnActorRow,
  ReturnDecisionEventRow,
  ReturnItemRow,
  ReturnRepairEventRow,
  ReturnWithItems,
} from '../return.types';

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
 * An account as a return names it (TASK-1963) — on ADMIN responses only.
 *
 * `name` is the user's first and last name as stored, whichever halves exist,
 * falling back to the email: staff accounts are often created with an email
 * alone, and an empty label on "who decided" reads as "nobody did".
 */
export class ReturnActorEntity {
  @ApiProperty({ description: 'Account id', format: 'uuid' })
  id!: string;

  @ApiProperty({
    description: 'First and last name as stored; the email when the account has no name',
    example: 'Олена Коваль',
  })
  name!: string;

  @ApiProperty({ description: 'Account email', example: 'olena@example.com' })
  email!: string;

  static from(row: ReturnActorRow | null): ReturnActorEntity | null {
    if (!row) return null;
    const entity = new ReturnActorEntity();
    entity.id = row.id;
    entity.name = displayName(row);
    entity.email = row.email;
    return entity;
  }
}

function displayName(row: ReturnActorRow): string {
  const name = [row.firstName, row.lastName]
    .map((part) => part?.trim())
    .filter(Boolean)
    .join(' ');
  return name || row.email;
}

/** One row of a return's decision history (TASK-1961, TASK-2044) — admin only. */
export class ReturnDecisionEventEntity {
  @ApiProperty({
    description: 'What was decided',
    enum: ReturnDecision,
    enumName: 'ReturnDecision',
  })
  decision!: ReturnDecision;

  @ApiProperty({
    description: 'The reason given to the customer; null on legacy rows and bare approvals',
    type: String,
    nullable: true,
  })
  reason!: string | null;

  @ApiProperty({
    description: 'True when inferred by the pre-B-12 backfill rather than taken by a person',
  })
  legacy!: boolean;

  @ApiProperty({ description: 'When it was decided', type: String, format: 'date-time' })
  createdAt!: Date;

  @ApiProperty({
    description: 'Who decided; null for legacy rows and deleted accounts',
    type: ReturnActorEntity,
    nullable: true,
  })
  actor!: ReturnActorEntity | null;

  static fromPrisma(row: ReturnDecisionEventRow): ReturnDecisionEventEntity {
    const entity = new ReturnDecisionEventEntity();
    entity.decision = row.decision;
    entity.reason = row.reason;
    entity.legacy = row.legacy;
    entity.createdAt = row.createdAt;
    entity.actor = ReturnActorEntity.from(row.actor);
    return entity;
  }
}

/**
 * One repair step (TASK-2045). The customer sees the step, the result, where the
 * device went and the waybill; the operator's note and who recorded the step are
 * admin-only.
 */
export class ReturnRepairStepEntity {
  @ApiProperty({ description: 'Repair step', enum: ReturnRepairStep, enumName: 'ReturnRepairStep' })
  step!: ReturnRepairStep;

  @ApiProperty({
    description: 'What the service centre reported; set on RETURNED_FROM_SERVICE',
    enum: RepairResult,
    enumName: 'RepairResult',
    nullable: true,
  })
  result!: RepairResult | null;

  @ApiProperty({ description: 'The service centre, free text', type: String, nullable: true })
  destination!: string | null;

  @ApiProperty({
    description: 'Nova Poshta waybill number, when the step involved a shipment',
    type: String,
    nullable: true,
  })
  ttn!: string | null;

  @ApiProperty({ description: 'When the step was recorded', type: String, format: 'date-time' })
  createdAt!: Date;

  @ApiProperty({
    description: 'Operator-only note. Present ONLY on admin responses.',
    type: String,
    required: false,
    nullable: true,
  })
  note?: string | null;

  @ApiProperty({
    description:
      'Who recorded the step; null for deleted accounts. Present ONLY on admin responses.',
    type: ReturnActorEntity,
    required: false,
    nullable: true,
  })
  actor?: ReturnActorEntity | null;

  static fromPrisma(
    row: ReturnRepairEventRow,
    options: { includeInternal?: boolean } = {},
  ): ReturnRepairStepEntity {
    const entity = new ReturnRepairStepEntity();
    entity.step = row.step;
    entity.result = row.result;
    entity.destination = row.destination;
    entity.ttn = row.ttn;
    entity.createdAt = row.createdAt;
    if (options.includeInternal) {
      entity.note = row.note ?? null;
      entity.actor = ReturnActorEntity.from(row.actor ?? null);
    }
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

  /** Who opened the request, by name (TASK-1963). Admin-only, like the id above. */
  @ApiProperty({
    description:
      'Who opened the request — the customer, or the operator who filed it for them; null for ' +
      'rows predating the column and for deleted accounts. Present ONLY on admin responses.',
    type: () => ReturnActorEntity,
    required: false,
    nullable: true,
  })
  createdBy?: ReturnActorEntity | null;

  /*
   * What was asked and through which door (TASK-2044, TASK-1963), and the
   * decision (TASK-1961, TASK-2044): on BOTH projections — the customer is told
   * what was decided, why and when. Never who: the author stays admin-only.
   */

  @ApiProperty({
    description:
      'What the customer asked for; null when they did not say, and on requests filed before ' +
      'the field existed.',
    enum: ReturnOutcome,
    enumName: 'ReturnOutcome',
    nullable: true,
  })
  requestedOutcome!: ReturnOutcome | null;

  @ApiProperty({
    description:
      'Which door the request came through: the customer account, a guest link, or an ' +
      'operator writing it down for the customer.',
    enum: ReturnChannel,
    enumName: 'ReturnChannel',
  })
  channel!: ReturnChannel;

  @ApiProperty({
    description: 'The current decision; null while nobody has decided.',
    enum: ReturnDecision,
    enumName: 'ReturnDecision',
    nullable: true,
  })
  decision!: ReturnDecision | null;

  @ApiProperty({
    description:
      'Why — the reason the customer is shown. Null on legacy (pre-B-12) decisions and on ' +
      'approvals given without one.',
    type: String,
    nullable: true,
  })
  decisionReason!: string | null;

  @ApiProperty({
    description: 'When the current decision was taken.',
    type: String,
    format: 'date-time',
    nullable: true,
  })
  decidedAt!: Date | null;

  @ApiProperty({
    description:
      'True when the decision was inferred from the pre-B-12 status by the data backfill — ' +
      'no reason and no author were ever recorded for it.',
  })
  decisionLegacy!: boolean;

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

  @ApiProperty({
    description:
      'Who took the current decision, by name; null for legacy decisions and deleted ' +
      'accounts. Present ONLY on admin responses.',
    type: () => ReturnActorEntity,
    required: false,
    nullable: true,
  })
  decidedBy?: ReturnActorEntity | null;

  @ApiProperty({
    description:
      'Every decision, superseded ones included, oldest first. Present ONLY on admin ' +
      'single-return responses (GET /admin/returns/:id, the decision, PATCH and the admin ' +
      'create); omitted on lists.',
    type: () => [ReturnDecisionEventEntity],
    required: false,
  })
  decisionHistory?: ReturnDecisionEventEntity[];

  @ApiProperty({
    description:
      'Repair progress, oldest first. On customer responses each step carries no note and no ' +
      'actor. Present on customer responses and on admin single-return responses; omitted on ' +
      'admin lists.',
    type: () => [ReturnRepairStepEntity],
    required: false,
  })
  repairSteps?: ReturnRepairStepEntity[];

  @ApiProperty({
    description:
      'When the order was placed — the purchase date the 14-day window counts from. Present ' +
      'ONLY on admin responses.',
    type: String,
    format: 'date-time',
    required: false,
  })
  orderCreatedAt?: Date;

  @ApiProperty({ description: 'Lines coming back', type: [ReturnItemEntity] })
  items!: ReturnItemEntity[];

  /**
   * @param options.includeInternal the admin projection: operator notes, every
   *   staff account and the decision history. Without it, the customer
   *   projection — which never names a member of staff.
   */
  static fromPrisma(
    row: ReturnWithItems,
    options: { includeInternal?: boolean } = {},
  ): ReturnEntity {
    const admin = options.includeInternal === true;
    const entity = new ReturnEntity();
    entity.id = row.id;
    entity.orderId = row.orderId;
    entity.status = row.status;
    entity.reason = row.reason;
    entity.requestedOutcome = row.requestedOutcome ?? null;
    entity.channel = row.channel;
    entity.decision = row.decision;
    entity.decisionReason = row.decisionReason;
    entity.decidedAt = row.decidedAt;
    entity.decisionLegacy = row.decisionLegacy;
    if (admin) {
      entity.operatorNotes = row.operatorNotes;
      entity.createdByUserId = row.createdByUserId;
      entity.decidedById = row.decidedById;
      if (row.createdBy !== undefined) entity.createdBy = ReturnActorEntity.from(row.createdBy);
      if (row.decidedBy !== undefined) entity.decidedBy = ReturnActorEntity.from(row.decidedBy);
      if (row.decisionEvents) {
        entity.decisionHistory = row.decisionEvents.map((event) =>
          ReturnDecisionEventEntity.fromPrisma(event),
        );
      }
      if (row.order?.createdAt) entity.orderCreatedAt = row.order.createdAt;
    }
    if (row.repairEvents) {
      entity.repairSteps = row.repairEvents.map((event) =>
        ReturnRepairStepEntity.fromPrisma(event, { includeInternal: admin }),
      );
    }
    entity.requestedAt = row.requestedAt;
    entity.resolvedAt = row.resolvedAt;
    entity.restockedAt = row.restockedAt;
    entity.refundedAmount = row.refundedAmount ? row.refundedAmount.toString() : null;
    entity.items = row.items.map((item) => ReturnItemEntity.fromPrisma(item));
    return entity;
  }
}
