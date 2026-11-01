import { ApiProperty } from '@nestjs/swagger';
import {
  DeliveryMethod,
  MoneyDirection,
  MoneyEntryKind,
  MoneyProviderState,
  OrderStatus,
  PaymentMethod,
  PaymentStatus,
  ReturnStatus,
} from '@prisma/client';
import type { MoneyEntryRow } from '../order-money.repository';
import type { OrderMoneyView } from '../order-money.service';

/**
 * The operator's money block (R2 step A3 — TASK-2047, TASK-2046, TASK-1967):
 * `GET /api/admin/orders/:orderId/money` and the answer of every money write.
 *
 * Every amount is INTEGER KOPECKS. Everything shown — the payment status, the
 * balance («Борг» / «Винні покупцю»), what is owed per return — is derived from
 * the ledger on the server; the client renders, it does not compute.
 */

export class OrderMoneyTotalsEntity {
  @ApiProperty({ description: 'Order total, kopecks', example: 129900 })
  totalKop!: number;

  @ApiProperty({ description: 'Σ receipts, net of reversals, kopecks', example: 129900 })
  paidKop!: number;

  @ApiProperty({
    description: 'Σ payouts, net of reversals; a LiqPay refund counts from the request on',
    example: 0,
  })
  refundedKop!: number;

  @ApiProperty({ description: 'Σ «до повернення» of the REFUND-decided returns', example: 0 })
  returnCreditKop!: number;

  @ApiProperty({
    description:
      '> 0 the customer owes («Борг»), < 0 the shop owes the customer («Винні покупцю»). ' +
      'total − returnCredit − paid + refunded; 0 is due on a CANCELLED order.',
    example: 0,
  })
  balanceKop!: number;
}

export class OrderMoneyEntryEntity {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ enum: MoneyDirection, enumName: 'MoneyDirection' })
  direction!: MoneyDirection;

  @ApiProperty({ enum: MoneyEntryKind, enumName: 'MoneyEntryKind' })
  kind!: MoneyEntryKind;

  @ApiProperty({
    description: 'Integer kopecks, always > 0 — the direction (and reversalOfId) carry the sign',
    example: 50000,
  })
  amountKop!: number;

  @ApiProperty({ description: 'The return this payout settles', type: String, nullable: true })
  returnId!: string | null;

  @ApiProperty({ description: 'The LiqPay attempt of a LiqPay row', type: String, nullable: true })
  paymentId!: string | null;

  @ApiProperty({
    description:
      'LiqPay refunds only: REQUESTED until the provider confirms («очікує підтвердження ' +
      'LiqPay»), then CONFIRMED',
    enum: MoneyProviderState,
    enumName: 'MoneyProviderState',
    nullable: true,
  })
  providerState!: MoneyProviderState | null;

  @ApiProperty({
    description: 'Who wrote it; null for LiqPay/system rows',
    nullable: true,
    type: String,
  })
  actorId!: string | null;

  @ApiProperty({
    description: 'First and last name (or email) of the author; null for LiqPay/system rows',
    type: String,
    nullable: true,
    example: 'Олена Коваль',
  })
  actorName!: string | null;

  @ApiProperty({ description: 'Note or reason', type: String, nullable: true })
  reason!: string | null;

  @ApiProperty({
    description: 'Set on a reversal (сторно): the entry it cancels',
    type: String,
    nullable: true,
  })
  reversalOfId!: string | null;

  @ApiProperty({
    description: 'Set when another entry reverses this one — show it struck through',
    type: String,
    nullable: true,
  })
  reversedById!: string | null;

  @ApiProperty({
    description: 'A LiqPay refund the provider refused (or an operator voided) — never moved money',
    type: String,
    format: 'date-time',
    nullable: true,
  })
  voidedAt!: Date | null;

  @ApiProperty({ type: String, nullable: true })
  voidReason!: string | null;

  @ApiProperty({ description: 'Inferred by the R2 backfill from pre-ledger labels' })
  legacy!: boolean;

  @ApiProperty({ description: 'When the money moved', format: 'date-time' })
  occurredAt!: Date;

  @ApiProperty({ description: 'When it was written', format: 'date-time' })
  createdAt!: Date;

  static from(row: MoneyEntryRow): OrderMoneyEntryEntity {
    const entity = new OrderMoneyEntryEntity();
    entity.id = row.id;
    entity.direction = row.direction;
    entity.kind = row.kind;
    entity.amountKop = row.amountKop;
    entity.returnId = row.returnId;
    entity.paymentId = row.paymentId;
    entity.providerState = row.providerState;
    entity.actorId = row.actorId;
    entity.actorName = row.actorName;
    entity.reason = row.reason;
    entity.reversalOfId = row.reversalOfId;
    entity.reversedById = row.reversedById;
    entity.voidedAt = row.voidedAt;
    entity.voidReason = row.voidReason;
    entity.legacy = row.legacy;
    entity.occurredAt = row.occurredAt;
    entity.createdAt = row.createdAt;
    return entity;
  }
}

export class OrderMoneyRefundablePaymentEntity {
  @ApiProperty({ format: 'uuid' })
  paymentId!: string;

  @ApiProperty({
    description: 'Most that may still go back to this card through LiqPay, kopecks',
    example: 129900,
  })
  remainingKop!: number;
}

export class OrderMoneyReturnEntity {
  @ApiProperty({ format: 'uuid' })
  returnId!: string;

  @ApiProperty({ enum: ReturnStatus, enumName: 'ReturnStatus' })
  status!: ReturnStatus;

  @ApiProperty({ description: '«До повернення», kopecks', example: 33333 })
  creditKop!: number;

  @ApiProperty({ description: 'Why the credit was lowered', type: String, nullable: true })
  creditReason!: string | null;

  @ApiProperty({ description: 'Σ payouts on this return, net of reversals', example: 10000 })
  paidOutKop!: number;

  @ApiProperty({ description: 'Still owed on this return (credit − payouts, ≥ 0)', example: 23333 })
  owedKop!: number;
}

export class OrderMoneyEntity {
  @ApiProperty({ format: 'uuid' })
  orderId!: string;

  @ApiProperty({ enum: OrderStatus, enumName: 'OrderStatus' })
  orderStatus!: OrderStatus;

  @ApiProperty({
    description: 'Derived from the ledger — a label to show, not a control',
    enum: PaymentStatus,
    enumName: 'PaymentStatus',
  })
  paymentStatus!: PaymentStatus;

  @ApiProperty({ enum: PaymentMethod, enumName: 'PaymentMethod' })
  paymentMethod!: PaymentMethod;

  @ApiProperty({ enum: DeliveryMethod, enumName: 'DeliveryMethod' })
  deliveryMethod!: DeliveryMethod;

  @ApiProperty({
    description:
      "The order's updatedAt — send it back as expectedUpdatedAt on the next money write",
    format: 'date-time',
  })
  updatedAt!: Date;

  @ApiProperty({ type: OrderMoneyTotalsEntity })
  totals!: OrderMoneyTotalsEntity;

  @ApiProperty({
    description: 'The journal, oldest first (by when the money moved)',
    type: [OrderMoneyEntryEntity],
  })
  entries!: OrderMoneyEntryEntity[];

  @ApiProperty({
    description:
      'What «Записати надходження» may offer, the customer-chosen kind first: the delivery ' +
      'hand-over kind and BANK_TRANSFER (only BANK_TRANSFER for OTHER delivery)',
    enum: MoneyEntryKind,
    enumName: 'MoneyEntryKind',
    isArray: true,
  })
  allowedInKinds!: MoneyEntryKind[];

  @ApiProperty({
    description:
      'LiqPay attempts that can still be refunded to the card. Null for a reader without ' +
      'payments:read.',
    type: [OrderMoneyRefundablePaymentEntity],
    nullable: true,
  })
  refundablePayments!: OrderMoneyRefundablePaymentEntity[] | null;

  @ApiProperty({
    description:
      'Most that may go back WITHOUT a return right now: paid − refunded on a cancelled ' +
      'order, the overpayment otherwise; 0 when only a return can pay out',
    example: 0,
  })
  outWithoutReturnMaxKop!: number;

  @ApiProperty({
    description: 'The REFUND-decided returns with what is owed and paid out on each',
    type: [OrderMoneyReturnEntity],
  })
  returns!: OrderMoneyReturnEntity[];

  static from(view: OrderMoneyView): OrderMoneyEntity {
    const entity = new OrderMoneyEntity();
    entity.orderId = view.orderId;
    entity.orderStatus = view.orderStatus;
    entity.paymentStatus = view.paymentStatus;
    entity.paymentMethod = view.paymentMethod;
    entity.deliveryMethod = view.deliveryMethod;
    entity.updatedAt = view.updatedAt;
    entity.totals = Object.assign(new OrderMoneyTotalsEntity(), view.totals);
    entity.entries = view.entries.map((row) => OrderMoneyEntryEntity.from(row));
    entity.allowedInKinds = view.allowedInKinds;
    entity.refundablePayments = view.refundablePayments
      ? view.refundablePayments.map((p) =>
          Object.assign(new OrderMoneyRefundablePaymentEntity(), p),
        )
      : null;
    entity.outWithoutReturnMaxKop = view.outWithoutReturnMaxKop;
    entity.returns = view.returns.map((r) => Object.assign(new OrderMoneyReturnEntity(), r));
    return entity;
  }
}
