import { DeliveryMethod, Prisma } from '@prisma/client';
import { flatShippingCost, isCourierFree, resolveDeliveryMethod } from './shipping-cost';

/**
 * TASK-643 — pure shipping pricing for the methods that need no carrier call,
 * and the rule that turns a request into a delivery method.
 */
describe('resolveDeliveryMethod', () => {
  it('uses an explicit method as is, whatever the address carries', () => {
    expect(
      resolveDeliveryMethod({ deliveryMethod: DeliveryMethod.COURIER, npCityRef: 'city-ref' }),
    ).toBe(DeliveryMethod.COURIER);
    expect(resolveDeliveryMethod({ deliveryMethod: DeliveryMethod.NOVA_POSHTA })).toBe(
      DeliveryMethod.NOVA_POSHTA,
    );
  });

  it('derives NOVA_POSHTA from an NP city ref when no method was sent (legacy client)', () => {
    expect(resolveDeliveryMethod({ npCityRef: 'city-ref' })).toBe(DeliveryMethod.NOVA_POSHTA);
  });

  it('derives OTHER from a free-text address when no method was sent', () => {
    expect(resolveDeliveryMethod({})).toBe(DeliveryMethod.OTHER);
    expect(resolveDeliveryMethod({ npCityRef: undefined })).toBe(DeliveryMethod.OTHER);
    expect(resolveDeliveryMethod({ npCityRef: null })).toBe(DeliveryMethod.OTHER);
  });

  it('treats an empty npCityRef as absent', () => {
    expect(resolveDeliveryMethod({ npCityRef: '' })).toBe(DeliveryMethod.OTHER);
  });

  it('treats a null method as absent', () => {
    expect(resolveDeliveryMethod({ deliveryMethod: null, npCityRef: 'r' })).toBe(
      DeliveryMethod.NOVA_POSHTA,
    );
  });
});

describe('isCourierFree', () => {
  it('is never free without a threshold', () => {
    expect(isCourierFree('100000.00', null)).toBe(false);
  });

  it('is free when the subtotal is exactly on the threshold', () => {
    expect(isCourierFree('1500.00', '1500.00')).toBe(true);
  });

  it('is free above the threshold', () => {
    expect(isCourierFree('1500.01', '1500')).toBe(true);
  });

  it('is not free one cent below the threshold', () => {
    expect(isCourierFree('1499.99', '1500')).toBe(false);
  });

  it('compares in cents, not floats (0.1 + 0.2 territory)', () => {
    // 0.30 as a subtotal against a 0.3 threshold must be "equal", not "below".
    expect(isCourierFree('0.30', new Prisma.Decimal('0.3'))).toBe(true);
  });

  it('accepts Prisma Decimal on both sides', () => {
    expect(isCourierFree(new Prisma.Decimal('2000'), new Prisma.Decimal('1999.99'))).toBe(true);
  });
});

describe('flatShippingCost', () => {
  const rules = { courierPrice: '120.00', courierFreeFrom: '1500.00' };

  it('PICKUP costs nothing', () => {
    expect(flatShippingCost(DeliveryMethod.PICKUP, { ...rules, subtotal: '10.00' })).toBe('0.00');
  });

  it('OTHER is booked at 0 — the real price is quoted later by the operator', () => {
    expect(flatShippingCost(DeliveryMethod.OTHER, { ...rules, subtotal: '10.00' })).toBe('0.00');
  });

  describe('COURIER', () => {
    it('charges the courier price below the threshold', () => {
      expect(flatShippingCost(DeliveryMethod.COURIER, { ...rules, subtotal: '1499.99' })).toBe(
        '120.00',
      );
    });

    it('is free exactly on the threshold', () => {
      expect(flatShippingCost(DeliveryMethod.COURIER, { ...rules, subtotal: '1500.00' })).toBe(
        '0.00',
      );
    });

    it('is free above the threshold', () => {
      expect(flatShippingCost(DeliveryMethod.COURIER, { ...rules, subtotal: '9000' })).toBe('0.00');
    });

    it('always charges when there is no threshold', () => {
      expect(
        flatShippingCost(DeliveryMethod.COURIER, {
          courierPrice: '80',
          courierFreeFrom: null,
          subtotal: '999999.99',
        }),
      ).toBe('80.00');
    });

    it('a zero courier price stays zero', () => {
      expect(
        flatShippingCost(DeliveryMethod.COURIER, {
          courierPrice: '0',
          courierFreeFrom: null,
          subtotal: '10',
        }),
      ).toBe('0.00');
    });

    it('takes Prisma Decimal inputs and pads the result', () => {
      expect(
        flatShippingCost(DeliveryMethod.COURIER, {
          courierPrice: new Prisma.Decimal('99.9'),
          courierFreeFrom: new Prisma.Decimal('500'),
          subtotal: new Prisma.Decimal('499.99'),
        }),
      ).toBe('99.90');
    });
  });
});
