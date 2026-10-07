import { DeliveryMethod, OrderStatus, PaymentMethod, PaymentStatus } from '@prisma/client';
import {
  PublicOrderEntity,
  isShippingCostPending,
  type PublicOrderRow,
} from './public-order.entity';

/**
 * The public "check my order" projection, delivery half (TASK-1023 / TASK-1030).
 *
 * The page may name the method, the city, the NP branch and — for pickup — the
 * SHOP's point. It may never name the buyer's street, whatever the method.
 */

const money = (value: string) => ({ toString: () => value });

function makeRow(overrides: Partial<PublicOrderRow> = {}): PublicOrderRow {
  return {
    id: '94f5f971-1111-2222-3333-444455556666',
    createdAt: new Date('2026-09-01T10:00:00.000Z'),
    status: OrderStatus.CONFIRMED,
    paymentStatus: PaymentStatus.PENDING,
    paymentMethod: PaymentMethod.ON_DELIVERY,
    deliveryMethod: DeliveryMethod.NOVA_POSHTA,
    subtotal: money('598.00'),
    discount: money('0.00'),
    shippingCost: money('70.00'),
    addonsTotal: money('0.00'),
    total: money('668.00'),
    trackingNumber: null,
    shippingAddress: {
      firstName: 'Олена',
      lastName: 'Коваль',
      phone: '+380501112233',
      address1: 'вул. Січових Стрільців, 37, кв. 12',
      city: 'Київ',
      npWarehouseName: 'Відділення №12',
      deliveryMethod: DeliveryMethod.NOVA_POSHTA,
      carrier: 'NOVA_POSHTA',
    },
    items: [],
    ...overrides,
  };
}

describe('PublicOrderEntity.fromRow — delivery (TASK-1023 / TASK-1030)', () => {
  it('names a Nova Poshta order with its city and branch', () => {
    const entity = PublicOrderEntity.fromRow(makeRow());

    expect(entity.deliveryMethod).toBe(DeliveryMethod.NOVA_POSHTA);
    expect(entity.delivery).toEqual({
      city: 'Київ',
      warehouse: 'Відділення №12',
      pickupPointName: null,
      pickupPointAddress: null,
      shippingCostPending: false,
    });
  });

  it("shows a pickup order's point — the shop's address — and no buyer data", () => {
    const entity = PublicOrderEntity.fromRow(
      makeRow({
        deliveryMethod: DeliveryMethod.PICKUP,
        shippingCost: money('0.00'),
        shippingAddress: {
          firstName: 'Олена',
          lastName: 'Коваль',
          phone: '+380501112233',
          address1: 'вул. Хрещатик, 22',
          city: 'Київ',
          deliveryMethod: DeliveryMethod.PICKUP,
          carrier: null,
          pickupPointName: 'Магазин на Хрещатику',
          pickupPointAddress: 'вул. Хрещатик, 22',
          pickupPointHours: 'Пн–Сб 10:00–20:00',
          pickupPointPhone: '+380441234567',
        },
      }),
    );

    expect(entity.deliveryMethod).toBe(DeliveryMethod.PICKUP);
    expect(entity.delivery).toEqual({
      city: 'Київ',
      warehouse: null,
      pickupPointName: 'Магазин на Хрещатику',
      pickupPointAddress: 'вул. Хрещатик, 22',
      shippingCostPending: false,
    });
    expect(JSON.stringify(entity)).not.toContain('Коваль');
  });

  it('never shows the street of a courier order — only the city', () => {
    const entity = PublicOrderEntity.fromRow(
      makeRow({
        deliveryMethod: DeliveryMethod.COURIER,
        shippingAddress: {
          firstName: 'Олена',
          lastName: 'Коваль',
          address1: 'вул. Січових Стрільців, 37, кв. 12',
          city: 'Київ',
          deliveryMethod: DeliveryMethod.COURIER,
          carrier: null,
        },
      }),
    );

    expect(entity.delivery).toEqual({
      city: 'Київ',
      warehouse: null,
      pickupPointName: null,
      pickupPointAddress: null,
      shippingCostPending: false,
    });
    expect(JSON.stringify(entity)).not.toContain('Січових');
  });

  it('ignores pickup fields on a non-pickup order (they are only ever the shop’s for PICKUP)', () => {
    const entity = PublicOrderEntity.fromRow(
      makeRow({
        deliveryMethod: DeliveryMethod.COURIER,
        shippingAddress: {
          firstName: 'A',
          lastName: 'B',
          address1: 'вул. Приватна, 1',
          city: 'Київ',
          pickupPointName: 'вул. Приватна, 1',
          pickupPointAddress: 'вул. Приватна, 1',
        },
      }),
    );

    expect(entity.delivery.pickupPointName).toBeNull();
    expect(entity.delivery.pickupPointAddress).toBeNull();
    expect(JSON.stringify(entity)).not.toContain('Приватна');
  });

  it('marks an OTHER order as pending from the snapshot flag, without its street', () => {
    const entity = PublicOrderEntity.fromRow(
      makeRow({
        deliveryMethod: DeliveryMethod.OTHER,
        shippingCost: money('0.00'),
        shippingAddress: {
          firstName: 'Олена',
          lastName: 'Коваль',
          address1: 'вул. Корзо, 5',
          city: 'Ужгород',
          deliveryMethod: DeliveryMethod.OTHER,
          carrier: null,
          shippingCostPending: true,
        },
      }),
    );

    expect(entity.deliveryMethod).toBe(DeliveryMethod.OTHER);
    expect(entity.delivery).toEqual({
      city: 'Ужгород',
      warehouse: null,
      pickupPointName: null,
      pickupPointAddress: null,
      shippingCostPending: true,
    });
    expect(JSON.stringify(entity)).not.toContain('Корзо');
  });

  it('treats a backfilled OTHER order (no flag, cost 0) as pending too', () => {
    const entity = PublicOrderEntity.fromRow(
      makeRow({
        deliveryMethod: DeliveryMethod.OTHER,
        shippingCost: money('0.00'),
        shippingAddress: { firstName: 'A', lastName: 'B', address1: 'x', city: 'Львів' },
      }),
    );

    expect(entity.delivery.shippingCostPending).toBe(true);
  });

  // TASK-647: a Nova Poshta 0 is the fallback booked when the NP estimate failed
  // (or a phone order) — never "free".
  it('treats a Nova Poshta order at cost 0 with no flag as pending, not free', () => {
    const entity = PublicOrderEntity.fromRow(makeRow({ shippingCost: money('0.00') }));

    expect(entity.delivery.shippingCostPending).toBe(true);
  });

  it('defaults to NOVA_POSHTA when the row carries no method (fixtures before TASK-1023)', () => {
    const row = makeRow();
    delete row.deliveryMethod;

    expect(PublicOrderEntity.fromRow(row).deliveryMethod).toBe(DeliveryMethod.NOVA_POSHTA);
  });

  it('survives an order with no address snapshot at all', () => {
    const entity = PublicOrderEntity.fromRow(makeRow({ shippingAddress: null }));

    expect(entity.delivery).toEqual({
      city: null,
      warehouse: null,
      pickupPointName: null,
      pickupPointAddress: null,
      shippingCostPending: false,
    });
  });
});

describe('isShippingCostPending', () => {
  it('is false for a quoted OTHER order', () => {
    expect(isShippingCostPending(DeliveryMethod.OTHER, null, money('120.00'))).toBe(false);
  });

  it('is false once a cost is booked, even if the checkout snapshot still says pending', () => {
    expect(
      isShippingCostPending(DeliveryMethod.OTHER, { shippingCostPending: true }, money('120.00')),
    ).toBe(false);
  });

  it('is false for a free pickup or courier order', () => {
    expect(isShippingCostPending(DeliveryMethod.PICKUP, null, money('0.00'))).toBe(false);
    expect(isShippingCostPending(DeliveryMethod.COURIER, null, money('0'))).toBe(false);
  });

  it('is true for a Nova Poshta or OTHER order at 0 with no snapshot flag', () => {
    expect(isShippingCostPending(DeliveryMethod.NOVA_POSHTA, null, money('0.00'))).toBe(true);
    expect(isShippingCostPending(DeliveryMethod.NOVA_POSHTA, {}, money('0'))).toBe(true);
    expect(isShippingCostPending(DeliveryMethod.OTHER, null, money('0.00'))).toBe(true);
  });

  it('follows the snapshot flag whatever the method', () => {
    expect(
      isShippingCostPending(
        DeliveryMethod.NOVA_POSHTA,
        { shippingCostPending: true },
        money('0.00'),
      ),
    ).toBe(true);
  });
});
