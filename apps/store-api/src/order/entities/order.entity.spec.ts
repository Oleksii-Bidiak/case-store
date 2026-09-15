import { OrderStatus, PaymentMethod, PaymentStatus } from '@prisma/client';
import { OrderEntity } from './order.entity';
import type { OrderItemRow, OrderWithItems } from '../order.types';

/**
 * The derived marks of owner decision B-1, as the ENTITY answers them
 * (TASK-470 / 471).
 *
 * Two of the five marks are computed on the server because they need data the
 * client cannot have — which lines are no longer orderable — and one field,
 * `reservationExpiresAt`, is surfaced purely so the client can compute the other
 * two itself. None of the five is stored, which is the property these tests
 * exist to protect: the entity must report what the row actually says right now,
 * and must report NOTHING at all when the read never asked.
 *
 * The distinction between `undefined` and `[]` is the sharpest edge here. A
 * customer-facing read does not join the catalogue's availability columns, so it
 * cannot know whether a line is still orderable; answering `[]` there would be a
 * claim ("checked, all fine") the query never made, and the storefront would be
 * entitled to believe it.
 */

function buildItem(overrides: Partial<OrderItemRow['product']> = {}, id = 'item-1'): OrderItemRow {
  return {
    id,
    orderId: 'order-1',
    productId: 'prod-1',
    quantity: 1,
    price: { toString: () => '100.00' },
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    addons: [],
    product: {
      id: 'prod-1',
      name: 'Чохол',
      slug: 'chokhol',
      images: [],
      ...overrides,
    },
  };
}

function buildOrder(overrides: Partial<OrderWithItems> = {}): OrderWithItems {
  return {
    id: 'order-1',
    userId: 'user-1',
    status: OrderStatus.CONFIRMED,
    paymentStatus: PaymentStatus.PENDING,
    paymentMethod: PaymentMethod.ONLINE,
    subtotal: { toString: () => '100.00' },
    discount: { toString: () => '0.00' },
    discountCode: null,
    shippingCost: { toString: () => '0.00' },
    tax: { toString: () => '0.00' },
    addonsTotal: { toString: () => '0.00' },
    total: { toString: () => '100.00' },
    shippingAddress: null,
    billingAddress: null,
    notes: null,
    restockedAt: null,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    items: [buildItem()],
    ...overrides,
  };
}

describe('OrderEntity.fromPrisma — reservationExpiresAt (TASK-471)', () => {
  it('surfaces the reservation deadline as an ISO string', () => {
    const entity = OrderEntity.fromPrisma(
      buildOrder({ reservationExpiresAt: new Date('2026-01-01T00:30:00.000Z') }),
    );

    // The two marks «Очікує оплати · N хв» and «Резерв сплив» are the same
    // triple on either side of this instant. Without the column on the wire the
    // admin panel could tell that an order was unpaid, but not whether its stock
    // was still being held — the whole difference between "ring them" and "gone".
    expect(entity.reservationExpiresAt).toBe('2026-01-01T00:30:00.000Z');
  });

  it('is null — not absent — when the order holds no timed reservation', () => {
    expect(OrderEntity.fromPrisma(buildOrder()).reservationExpiresAt).toBeNull();
  });
});

describe('OrderEntity.fromPrisma — unavailableItemIds (TASK-470)', () => {
  const available = { deletedAt: null, isActive: true, stock: 5 };

  it('is ABSENT when the read did not join the availability columns', () => {
    // Every customer-facing path. `undefined` means "not measured"; `[]` would
    // mean "measured, nothing wrong", and a storefront reading the second would
    // be believing an answer no query ever gave.
    const entity = OrderEntity.fromPrisma(buildOrder());

    expect(entity.unavailableItemIds).toBeUndefined();
  });

  it('is an EMPTY array when every line was measured and is fine', () => {
    const entity = OrderEntity.fromPrisma(buildOrder({ items: [buildItem(available)] }));

    expect(entity.unavailableItemIds).toEqual([]);
  });

  it('flags a line whose product is a tombstone', () => {
    const entity = OrderEntity.fromPrisma(
      buildOrder({ items: [buildItem({ ...available, deletedAt: new Date() })] }),
    );

    expect(entity.unavailableItemIds).toEqual(['item-1']);
  });

  it('flags a line whose product is unpublished', () => {
    const entity = OrderEntity.fromPrisma(
      buildOrder({ items: [buildItem({ ...available, isActive: false })] }),
    );

    expect(entity.unavailableItemIds).toEqual(['item-1']);
  });

  it('flags a line whose product is oversold', () => {
    // stock < 0, not <= 0: zero is the normal state of the last unit being held
    // by this very order — stock is taken at creation.
    const entity = OrderEntity.fromPrisma(
      buildOrder({ items: [buildItem({ ...available, stock: -2 })] }),
    );

    expect(entity.unavailableItemIds).toEqual(['item-1']);
  });

  it('does NOT flag a line whose product is merely out of stock at zero', () => {
    const entity = OrderEntity.fromPrisma(
      buildOrder({ items: [buildItem({ ...available, stock: 0 })] }),
    );

    expect(entity.unavailableItemIds).toEqual([]);
  });

  it('flags every line when the TTL worker released the order reservation', () => {
    const entity = OrderEntity.fromPrisma(
      buildOrder({
        restockedAt: new Date('2026-01-01T01:00:00.000Z'),
        items: [buildItem(available, 'item-1'), buildItem(available, 'item-2')],
      }),
    );

    // The hold is what made the goods this order's; once it is released nothing
    // in the shop distinguishes these units from any other, so the whole order
    // is at risk, not one line of it.
    expect(entity.unavailableItemIds).toEqual(['item-1', 'item-2']);
  });

  it('does NOT flag a CANCELLED order whose stock came back', () => {
    // Its stock returned BECAUSE the order ended. Flagging it would bury the
    // handful of orders an operator must ring about under every cancelled order
    // the shop ever had — and the tile would never reach zero again.
    const entity = OrderEntity.fromPrisma(
      buildOrder({
        status: OrderStatus.CANCELLED,
        restockedAt: new Date('2026-01-01T01:00:00.000Z'),
        items: [buildItem(available)],
      }),
    );

    expect(entity.unavailableItemIds).toEqual([]);
  });

  it('does NOT flag a REFUNDED order whose stock came back', () => {
    const entity = OrderEntity.fromPrisma(
      buildOrder({
        status: OrderStatus.REFUNDED,
        restockedAt: new Date('2026-01-01T01:00:00.000Z'),
        items: [buildItem(available)],
      }),
    );

    expect(entity.unavailableItemIds).toEqual([]);
  });

  it('names the ORDER LINE, not the product — the same product can sit twice', () => {
    const entity = OrderEntity.fromPrisma(
      buildOrder({
        items: [
          buildItem(available, 'item-1'),
          buildItem({ ...available, isActive: false }, 'item-2'),
        ],
      }),
    );

    expect(entity.unavailableItemIds).toEqual(['item-2']);
  });
});
