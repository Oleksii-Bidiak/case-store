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
