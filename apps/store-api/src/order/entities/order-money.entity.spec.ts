import { MoneyDirection, MoneyEntryKind } from '@prisma/client';
import { OrderMoneyEntryEntity } from './order-money.entity';
import type { MoneyEntryRow } from '../order-money.repository';

const row = (over: Partial<MoneyEntryRow> = {}): MoneyEntryRow => ({
  id: 'e-1',
  orderId: 'order-1',
  direction: MoneyDirection.OUT,
  kind: MoneyEntryKind.OFFSET_TO_ORDER,
  amountKop: 50_000,
  returnId: null,
  paymentId: null,
  providerRef: null,
  providerState: null,
  actorId: 'admin-1',
  actorName: 'Олена Коваль',
  reason: null,
  reversalOfId: null,
  reversedById: null,
  voidedAt: null,
  voidReason: null,
  counterpartOrderId: 'order-2',
  legacy: false,
  occurredAt: new Date('2026-11-16T10:00:00Z'),
  createdAt: new Date('2026-11-16T10:00:00Z'),
  ...over,
});

/** TASK-2048: a «Залік» row names the other order of its pair. */
describe('OrderMoneyEntryEntity — offset counterpart', () => {
  it('carries the other order of a «Залік» pair', () => {
    expect(OrderMoneyEntryEntity.from(row()).counterpartOrderId).toBe('order-2');
  });

  it('is null on every other row', () => {
    expect(
      OrderMoneyEntryEntity.from(
        row({ kind: MoneyEntryKind.CASH_REFUND, counterpartOrderId: null }),
      ).counterpartOrderId,
    ).toBeNull();
  });
});
