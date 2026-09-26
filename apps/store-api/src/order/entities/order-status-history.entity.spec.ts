import {
  OrderHistoryChangeType,
  OrderHistoryNote,
  OrderStatus,
  PaymentStatus,
} from '@prisma/client';
import { OrderStatusHistoryEntity } from './order-status-history.entity';

/**
 * TASK-932 (absorbed by TASK-788): `order_status_history.note` was written — the
 * late-payment path stamps PAID_AFTER_CANCEL — but the entity dropped it, so the
 * admin timeline showed an ordinary PENDING → PAID and nobody saw the flag.
 */
describe('OrderStatusHistoryEntity.fromPrisma — note', () => {
  const base = {
    id: 'h-1',
    orderId: 'o-1',
    rejectedPaymentStatus: null,
    changedBy: null,
    changedAt: new Date('2026-09-24T10:00:00.000Z'),
  };

  it('carries PAID_AFTER_CANCEL on a payment row', () => {
    const entity = OrderStatusHistoryEntity.fromPrisma({
      ...base,
      changeType: OrderHistoryChangeType.PAYMENT_STATUS,
      fromStatus: null,
      toStatus: null,
      fromPaymentStatus: PaymentStatus.PENDING,
      toPaymentStatus: PaymentStatus.PAID,
      note: OrderHistoryNote.PAID_AFTER_CANCEL,
    });

    expect(entity.note).toBe(OrderHistoryNote.PAID_AFTER_CANCEL);
  });

  it('carries SHIPPED_UNPAID on a status row', () => {
    const entity = OrderStatusHistoryEntity.fromPrisma({
      ...base,
      changeType: OrderHistoryChangeType.STATUS,
      fromStatus: OrderStatus.PROCESSING,
      toStatus: OrderStatus.SHIPPED,
      fromPaymentStatus: null,
      toPaymentStatus: null,
      note: OrderHistoryNote.SHIPPED_UNPAID,
    });

    expect(entity.note).toBe(OrderHistoryNote.SHIPPED_UNPAID);
  });

  it('is null on an ordinary row', () => {
    const entity = OrderStatusHistoryEntity.fromPrisma({
      ...base,
      changeType: OrderHistoryChangeType.STATUS,
      fromStatus: OrderStatus.PENDING,
      toStatus: OrderStatus.CONFIRMED,
      fromPaymentStatus: null,
      toPaymentStatus: null,
      note: null,
    });

    expect(entity.note).toBeNull();
  });
});

/**
 * TASK-621: a refused provider event is written `current → current` with the
 * PAYMENT_EVENT_REFUSED note and the requested status in its own column; the
 * entity must carry both, or the timeline is back to «Оплачено → Оплачено».
 */
describe('OrderStatusHistoryEntity.fromPrisma — refused payment event', () => {
  it('carries the note and the rejected payment status', () => {
    const entity = OrderStatusHistoryEntity.fromPrisma({
      id: 'h-2',
      orderId: 'o-1',
      changeType: OrderHistoryChangeType.PAYMENT_STATUS,
      fromStatus: null,
      toStatus: null,
      fromPaymentStatus: PaymentStatus.PAID,
      toPaymentStatus: PaymentStatus.PAID,
      note: OrderHistoryNote.PAYMENT_EVENT_REFUSED,
      rejectedPaymentStatus: PaymentStatus.FAILED,
      changedBy: null,
      changedAt: new Date('2026-09-26T10:00:00.000Z'),
    });

    expect(entity.note).toBe(OrderHistoryNote.PAYMENT_EVENT_REFUSED);
    expect(entity.rejectedPaymentStatus).toBe(PaymentStatus.FAILED);
    expect(entity.toPaymentStatus).toBe(PaymentStatus.PAID);
  });

  it('is null on every other row', () => {
    const entity = OrderStatusHistoryEntity.fromPrisma({
      id: 'h-3',
      orderId: 'o-1',
      changeType: OrderHistoryChangeType.PAYMENT_STATUS,
      fromStatus: null,
      toStatus: null,
      fromPaymentStatus: PaymentStatus.PENDING,
      toPaymentStatus: PaymentStatus.PAID,
      note: null,
      rejectedPaymentStatus: null,
      changedBy: null,
      changedAt: new Date('2026-09-26T10:00:00.000Z'),
    });

    expect(entity.rejectedPaymentStatus).toBeNull();
  });
});
