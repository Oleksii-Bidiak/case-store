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

  describe('confirmsPaymentOfLiveOrder', () => {
    const live = { status: OrderStatus.PENDING, paymentStatus: PaymentStatus.PENDING };

    it('is true for a PENDING → PAID move on a live order', () => {
      expect(
        confirmsPaymentOfLiveOrder({
          expected: live,
          paymentStatusChange: { from: PaymentStatus.PENDING, to: PaymentStatus.PAID },
        }),
      ).toBe(true);
    });

    it('is true for FAILED → PAID (a second card worked)', () => {
      expect(
        confirmsPaymentOfLiveOrder({
          expected: { status: OrderStatus.PENDING, paymentStatus: PaymentStatus.FAILED },
          paymentStatusChange: { from: PaymentStatus.FAILED, to: PaymentStatus.PAID },
        }),
      ).toBe(true);
    });

    it('is false for a success on a cancelled order (PAID_AFTER_CANCEL)', () => {
      expect(
        confirmsPaymentOfLiveOrder({
          expected: { status: OrderStatus.CANCELLED, paymentStatus: PaymentStatus.PENDING },
          paymentStatusChange: {
            from: PaymentStatus.PENDING,
            to: PaymentStatus.PAID,
            note: OrderHistoryNote.PAID_AFTER_CANCEL,
          },
        }),
      ).toBe(false);
    });

    it('is false on either half of the cancelled signal alone', () => {
      expect(
        confirmsPaymentOfLiveOrder({
          expected: { status: OrderStatus.CANCELLED, paymentStatus: PaymentStatus.PENDING },
          paymentStatusChange: { from: PaymentStatus.PENDING, to: PaymentStatus.PAID },
        }),
      ).toBe(false);
      expect(
        confirmsPaymentOfLiveOrder({
          expected: live,
          paymentStatusChange: {
            from: PaymentStatus.PENDING,
            to: PaymentStatus.PAID,
            note: OrderHistoryNote.PAID_AFTER_CANCEL,
          },
        }),
      ).toBe(false);
    });

    it.each([PaymentStatus.FAILED, PaymentStatus.REFUNDED, PaymentStatus.PARTIALLY_REFUNDED])(
      'is false for a move to %s',
      (to) => {
        expect(
          confirmsPaymentOfLiveOrder({
            expected: { status: OrderStatus.CONFIRMED, paymentStatus: PaymentStatus.PAID },
            paymentStatusChange: { from: PaymentStatus.PAID, to },
          }),
        ).toBe(false);
      },
    );

    it('is false when the plan moves no payment status (a refusal, a superseded attempt)', () => {
      expect(confirmsPaymentOfLiveOrder({ expected: live })).toBe(false);
    });
  });
});
