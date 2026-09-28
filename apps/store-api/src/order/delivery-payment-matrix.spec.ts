import { DeliveryMethod, PaymentMethod } from '@prisma/client';
import {
  DELIVERY_PAYMENT_MATRIX,
  allowedPaymentMethods,
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
  NOVA_POSHTA: { ON_DELIVERY: true, ONLINE: true, INSTALLMENTS: true },
  PICKUP: { ON_DELIVERY: true, ONLINE: true, INSTALLMENTS: true },
  COURIER: { ON_DELIVERY: true, ONLINE: true, INSTALLMENTS: true },
  // No final amount to sign yet: the operator quotes shipping later.
  OTHER: { ON_DELIVERY: true, ONLINE: false, INSTALLMENTS: false },
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
});
