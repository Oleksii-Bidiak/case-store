import { DeliveryMethod, PaymentMethod } from '@prisma/client';
import {
  ADMIN_DELIVERY_PAYMENT_MATRIX,
  DELIVERY_PAYMENT_MATRIX,
  allowedPaymentMethods,
  isPaymentAllowedForAdminDelivery,
  isPaymentAllowedForDelivery,
} from './delivery-payment-matrix';

/**
 * TASK-643 — the delivery × payment matrix (owner decision B-6 §5).
 *
 * Every cell is spelled out rather than derived, so a change to either enum or
 * to the table has to be made here on purpose: a new delivery method that
 * silently inherits "everything allowed" is exactly the drift this guards.
 */
const EXPECTED: Record<DeliveryMethod, Record<PaymentMethod, boolean>> = {
  // BANK_TRANSFER (TASK-2047) is admin-only: the storefront matrix never offers
  // it. The admin matrix that does is wave R2 step A3.
  NOVA_POSHTA: { ON_DELIVERY: true, ONLINE: true, INSTALLMENTS: true, BANK_TRANSFER: false },
  PICKUP: { ON_DELIVERY: true, ONLINE: true, INSTALLMENTS: true, BANK_TRANSFER: false },
  COURIER: { ON_DELIVERY: true, ONLINE: true, INSTALLMENTS: true, BANK_TRANSFER: false },
  // No final amount to sign yet: the operator quotes shipping later.
  OTHER: { ON_DELIVERY: true, ONLINE: false, INSTALLMENTS: false, BANK_TRANSFER: false },
};

describe('delivery × payment matrix', () => {
  it('covers every delivery method and nothing else', () => {
    expect(Object.keys(DELIVERY_PAYMENT_MATRIX).sort()).toEqual(
      Object.values(DeliveryMethod).sort(),
    );
  });

  it('the expected table itself is exhaustive over both enums', () => {
    for (const delivery of Object.values(DeliveryMethod)) {
      expect(Object.keys(EXPECTED[delivery]).sort()).toEqual(Object.values(PaymentMethod).sort());
    }
  });

  describe('isPaymentAllowedForDelivery', () => {
    const cells = Object.values(DeliveryMethod).flatMap((delivery) =>
      Object.values(PaymentMethod).map(
        (payment) => [delivery, payment, EXPECTED[delivery][payment]] as const,
      ),
    );

    it.each(cells)('%s + %s → %s', (delivery, payment, allowed) => {
      expect(isPaymentAllowedForDelivery(delivery, payment)).toBe(allowed);
    });
  });

  describe('allowedPaymentMethods', () => {
    it.each(Object.values(DeliveryMethod))('lists exactly the allowed methods for %s', (d) => {
      const expected = Object.values(PaymentMethod).filter((p) => EXPECTED[d][p]);
      expect([...allowedPaymentMethods(d)].sort()).toEqual(expected.sort());
    });

    it('returns a caller-owned copy — mutating it cannot rewrite the rules', () => {
      const copy = allowedPaymentMethods(DeliveryMethod.OTHER);
      copy.push(PaymentMethod.ONLINE);

      expect(isPaymentAllowedForDelivery(DeliveryMethod.OTHER, PaymentMethod.ONLINE)).toBe(false);
      expect(allowedPaymentMethods(DeliveryMethod.OTHER)).toEqual([PaymentMethod.ON_DELIVERY]);
    });

    it('the table is frozen', () => {
      expect(Object.isFrozen(DELIVERY_PAYMENT_MATRIX)).toBe(true);
      expect(Object.isFrozen(DELIVERY_PAYMENT_MATRIX.OTHER)).toBe(true);
    });
  });

  // R2 A3 (TASK-2047): «Переказ на рахунок ФОП» is the operator's — a phone
  // order paid by transfer. Every delivery method admits it in the admin; the
  // storefront table above never does.
  describe('the admin matrix (BANK_TRANSFER)', () => {
    const ADMIN_EXPECTED: Record<DeliveryMethod, Record<PaymentMethod, boolean>> = {
      NOVA_POSHTA: { ...EXPECTED.NOVA_POSHTA, BANK_TRANSFER: true },
      PICKUP: { ...EXPECTED.PICKUP, BANK_TRANSFER: true },
      COURIER: { ...EXPECTED.COURIER, BANK_TRANSFER: true },
      OTHER: { ...EXPECTED.OTHER, BANK_TRANSFER: true },
    };

    const cells = Object.values(DeliveryMethod).flatMap((delivery) =>
      Object.values(PaymentMethod).map(
        (payment) => [delivery, payment, ADMIN_EXPECTED[delivery][payment]] as const,
      ),
    );

    it.each(cells)('admin: %s + %s → %s', (delivery, payment, allowed) => {
      expect(isPaymentAllowedForAdminDelivery(delivery, payment)).toBe(allowed);
    });

    it('is frozen too', () => {
      expect(Object.isFrozen(ADMIN_DELIVERY_PAYMENT_MATRIX)).toBe(true);
      expect(Object.isFrozen(ADMIN_DELIVERY_PAYMENT_MATRIX.PICKUP)).toBe(true);
    });
  });
});
