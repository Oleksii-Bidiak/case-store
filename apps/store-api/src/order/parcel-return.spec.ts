import { OrderStatus } from '@prisma/client';
import { parcelReturnRefusal, type ParcelReturnFacts } from './parcel-return';

/** A refused parcel: cancelled after it shipped, nothing returned yet. */
const returnable: ParcelReturnFacts = {
  status: OrderStatus.CANCELLED,
  restockedAt: null,
  cancelledFrom: OrderStatus.SHIPPED,
  hasOpenReturn: false,
};

describe('parcelReturnRefusal (TASK-2575)', () => {
  it('allows a parcel cancelled after shipment, not yet returned, with no return', () => {
    expect(parcelReturnRefusal(returnable)).toBeNull();
    expect(parcelReturnRefusal({ ...returnable, cancelledFrom: OrderStatus.DELIVERED })).toBeNull();
  });

  it('refuses an order that is not cancelled', () => {
    expect(parcelReturnRefusal({ ...returnable, status: OrderStatus.SHIPPED })).toBe(
      'NOT_CANCELLED_AFTER_SHIPMENT',
    );
  });

  it('refuses an order cancelled before shipment — its stock came back with the cancel', () => {
    expect(
      parcelReturnRefusal({
        ...returnable,
        cancelledFrom: OrderStatus.PROCESSING,
        restockedAt: new Date(),
      }),
    ).toBe('NOT_CANCELLED_AFTER_SHIPMENT');
    expect(parcelReturnRefusal({ ...returnable, cancelledFrom: null })).toBe(
      'NOT_CANCELLED_AFTER_SHIPMENT',
    );
  });

  it('refuses a parcel already returned to stock', () => {
    expect(parcelReturnRefusal({ ...returnable, restockedAt: new Date() })).toBe(
      'ALREADY_RETURNED',
    );
  });

  it('refuses an order with a return that is not REJECTED — the return owns those units', () => {
    expect(parcelReturnRefusal({ ...returnable, hasOpenReturn: true })).toBe('HAS_RETURN');
  });
});
