import { OrderHistoryNote, OrderStatus, PaymentMethod, PaymentStatus } from '@prisma/client';
import {
  confirmsPaymentOfLiveOrder,
  shopPingAtCreation,
  shopPingOnPaymentConfirmed,
} from './shop-order-ping';

/**
 * When the shop hears about an order (TASK-678, owner decision B-7 №7): cash on
 * delivery at creation, online methods once the provider confirms the money —
 * and every method at exactly one of the two moments.
 */
describe('shop-order-ping (TASK-678)', () => {
  describe('shopPingAtCreation', () => {
    it('pings at creation for cash on delivery', () => {
      expect(shopPingAtCreation(PaymentMethod.ON_DELIVERY)).toBe(true);
    });

    it.each([PaymentMethod.ONLINE, PaymentMethod.INSTALLMENTS])(
      'does not ping at creation for %s — it is not a sale until it is paid',
      (method) => {
        expect(shopPingAtCreation(method)).toBe(false);
      },
    );

    it.each([null, undefined])('reads %p as ON_DELIVERY, the column default', (method) => {
      expect(shopPingAtCreation(method)).toBe(true);
    });
  });

  describe('shopPingOnPaymentConfirmed', () => {
    it.each([PaymentMethod.ONLINE, PaymentMethod.INSTALLMENTS])('pings on payment for %s', (m) => {
      expect(shopPingOnPaymentConfirmed(m)).toBe(true);
    });

    it.each([PaymentMethod.ON_DELIVERY, null, undefined])(
      'never pings on payment for %p — that order was announced when it was placed',
      (method) => {
        expect(shopPingOnPaymentConfirmed(method)).toBe(false);
      },
    );

    it('gives every method exactly one moment', () => {
      for (const method of Object.values(PaymentMethod)) {
        expect(shopPingAtCreation(method)).not.toBe(shopPingOnPaymentConfirmed(method));
      }
    });
  });

  // R2 A2 (TASK-2047): a success is a RECEIPT on the plan, not a hand-built
  // payment-status move — the status is derived from the ledger afterwards.
  describe('confirmsPaymentOfLiveOrder', () => {
    const live = { status: OrderStatus.PENDING, paymentStatus: PaymentStatus.PENDING };
    const receipt = { amountKop: 100_000, occurredAt: new Date('2026-11-01T10:00:00Z') };

    it('is true for the first receipt on a live order', () => {
      expect(confirmsPaymentOfLiveOrder({ expected: live, receipt })).toBe(true);
    });

    it.each([PaymentStatus.FAILED, PaymentStatus.PARTIALLY_PAID])(
      'is true for a receipt on a %s order (it was never announced)',
      (paymentStatus) => {
        expect(
          confirmsPaymentOfLiveOrder({
            expected: { status: OrderStatus.PENDING, paymentStatus },
            receipt,
          }),
        ).toBe(true);
      },
    );

    it('is false for a success on a cancelled order (PAID_AFTER_CANCEL)', () => {
      expect(
        confirmsPaymentOfLiveOrder({
          expected: { status: OrderStatus.CANCELLED, paymentStatus: PaymentStatus.PENDING },
          receipt: { ...receipt, note: OrderHistoryNote.PAID_AFTER_CANCEL },
        }),
      ).toBe(false);
    });

    it('is false on either half of the cancelled signal alone', () => {
      expect(
        confirmsPaymentOfLiveOrder({
          expected: { status: OrderStatus.CANCELLED, paymentStatus: PaymentStatus.PENDING },
          receipt,
        }),
      ).toBe(false);
      expect(
        confirmsPaymentOfLiveOrder({
          expected: live,
          receipt: { ...receipt, note: OrderHistoryNote.PAID_AFTER_CANCEL },
        }),
      ).toBe(false);
    });

    it.each([PaymentStatus.PAID, PaymentStatus.PARTIALLY_REFUNDED, PaymentStatus.REFUNDED])(
      'is false for a second receipt on an order already %s — it was announced once',
      (paymentStatus) => {
        expect(
          confirmsPaymentOfLiveOrder({
            expected: { status: OrderStatus.CONFIRMED, paymentStatus },
            receipt,
          }),
        ).toBe(false);
      },
    );

    it('is false when the plan brings no money (a failure, a refund, a refusal)', () => {
      expect(confirmsPaymentOfLiveOrder({ expected: live })).toBe(false);
    });
  });
});
