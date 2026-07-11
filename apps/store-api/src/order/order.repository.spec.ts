import { ConflictException } from '@nestjs/common';
import { OrderStatus, PaymentStatus, OrderHistoryChangeType } from '@prisma/client';
import { OrderRepository } from './order.repository';
import { PrismaService } from '../prisma';
import {
  CacheService,
  productDetailIdKey,
  productDetailSlugKey,
  PRODUCT_LIST_PREFIX,
} from '../cache';
import type { CreateOrderParams } from './order.types';
import type { CartWithItems } from '../cart/cart.repository';

// ─── CacheService mock ────────────────────────────────────────────────────────

const cacheMock = {
  get: jest.fn().mockResolvedValue(null),
  set: jest.fn().mockResolvedValue(undefined),
  del: jest.fn().mockResolvedValue(undefined),
  delByPrefix: jest.fn().mockResolvedValue(undefined),
};

// ─── Prisma mock ────────────────────────────────────────────────────────────

const makeTx = () => ({
  order: {
    create: jest.fn(),
    update: jest.fn(),
    findUniqueOrThrow: jest.fn(),
  },
  cartItem: {
    deleteMany: jest.fn(),
  },
  product: {
    updateMany: jest.fn(),
    update: jest.fn(),
  },
  // TASK-251: history rows are written inside every mutation transaction.
  orderStatusHistory: {
    create: jest.fn(),
  },
});

const prismaMock = {
  $transaction: jest.fn(),
  order: {
    findFirst: jest.fn(),
    findMany: jest.fn(),
    count: jest.fn(),
    update: jest.fn(),
  },
  // TASK-251: history read path.
  orderStatusHistory: {
    findMany: jest.fn(),
  },
};

// ─── Test data ──────────────────────────────────────────────────────────────

const firstItem: CartWithItems['items'][number] = {
  id: 'cart-item-1',
  productId: 'product-uuid-1',
  quantity: 2,
  createdAt: new Date(),
  updatedAt: new Date(),
  product: {
    id: 'product-uuid-1',
    name: 'iPhone 15 Pro Case',
    price: { toString: () => '29.99' } as never,
    compareAtPrice: null,
    stock: 50,
    isActive: true,
  },
};

const secondItem: CartWithItems['items'][number] = {
  id: 'cart-item-2',
  productId: 'product-uuid-2',
  quantity: 1,
  createdAt: new Date(),
  updatedAt: new Date(),
  product: {
    id: 'product-uuid-2',
    name: 'Screen Protector',
    price: { toString: () => '9.99' } as never,
    compareAtPrice: null,
    stock: 30,
    isActive: true,
  },
};

const baseParams: CreateOrderParams = {
  userId: 'user-uuid-1',
  cartId: 'cart-uuid-1',
  cartItems: [firstItem, secondItem],
  shippingAddress: {
    firstName: 'Olena',
    lastName: 'Shevchenko',
    phone: '+380501234567',
    address1: 'Нова Пошта, відділення №12',
    city: 'Kyiv',
    country: 'UA',
  },
};

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('OrderRepository', () => {
  let repository: OrderRepository;

  beforeEach(() => {
    jest.clearAllMocks();
    cacheMock.get.mockResolvedValue(null);
    cacheMock.set.mockResolvedValue(undefined);
    cacheMock.del.mockResolvedValue(undefined);
    cacheMock.delByPrefix.mockResolvedValue(undefined);
    repository = new OrderRepository(
      prismaMock as unknown as PrismaService,
      cacheMock as unknown as CacheService,
    );
  });

  // ─── createFromCart — stock decrement guard (CRITICAL / TASK-053) ──────────

  describe('createFromCart — stock decrement', () => {
    it('decrements stock with a conditional WHERE stock >= quantity for each position', async () => {
      const tx = makeTx();
      tx.order.create.mockResolvedValue({ id: 'order-1', items: [] });
      tx.product.updateMany.mockResolvedValue({ count: 1 });
      prismaMock.$transaction.mockImplementation(async (cb: (t: typeof tx) => unknown) => cb(tx));

      await repository.createFromCart(baseParams);

      // Every ordered position is decremented on its own product row.
      expect(tx.product.updateMany).toHaveBeenCalledTimes(2);
      expect(tx.product.updateMany).toHaveBeenCalledWith({
        where: { id: 'product-uuid-1', stock: { gte: 2 } },
        data: { stock: { decrement: 2 } },
      });
    });

    it('throws ConflictException and aborts when no stock row is affected (oversell guard)', async () => {
      const tx = makeTx();
      tx.order.create.mockResolvedValue({ id: 'order-1', items: [] });
      // Stock was consumed by a racing order: the conditional update affects 0 rows.
      tx.product.updateMany.mockResolvedValue({ count: 0 });
      prismaMock.$transaction.mockImplementation(async (cb: (t: typeof tx) => unknown) => cb(tx));

      await expect(repository.createFromCart(baseParams)).rejects.toThrow(ConflictException);
    });

    // ── TASK-103-F: in-transaction afterCreate hook (mail-outbox enqueue seam) ──
    it('invokes the afterCreate hook inside the transaction with the tx client and created order', async () => {
      const tx = makeTx();
      const created = { id: 'order-1', items: [] };
      tx.order.create.mockResolvedValue(created);
      tx.product.updateMany.mockResolvedValue({ count: 1 });
      prismaMock.$transaction.mockImplementation(async (cb: (t: typeof tx) => unknown) => cb(tx));
      const afterCreate = jest.fn().mockResolvedValue(undefined);

      await repository.createFromCart(baseParams, afterCreate);

      expect(afterCreate).toHaveBeenCalledTimes(1);
      // Receives the SAME tx client used for the order write, plus the order.
      expect(afterCreate).toHaveBeenCalledWith(tx, created);
    });

    it('rolls the order back when the afterCreate hook throws (atomic outbox write)', async () => {
      const tx = makeTx();
      tx.order.create.mockResolvedValue({ id: 'order-1', items: [] });
      tx.product.updateMany.mockResolvedValue({ count: 1 });
      prismaMock.$transaction.mockImplementation(async (cb: (t: typeof tx) => unknown) => cb(tx));
      const afterCreate = jest.fn().mockRejectedValue(new Error('outbox write failed'));

      await expect(repository.createFromCart(baseParams, afterCreate)).rejects.toThrow(
        'outbox write failed',
      );
    });

    // ── TASK-251: initial status-history row inside the order transaction ──
    it('writes an initial null→PENDING system-authored history row in the same transaction', async () => {
      const tx = makeTx();
      tx.order.create.mockResolvedValue({ id: 'order-1', items: [] });
      tx.product.updateMany.mockResolvedValue({ count: 1 });
      prismaMock.$transaction.mockImplementation(async (cb: (t: typeof tx) => unknown) => cb(tx));

      await repository.createFromCart(baseParams);

      // The order's birth record: fromStatus null, toStatus PENDING, no actor.
      expect(tx.orderStatusHistory.create).toHaveBeenCalledWith({
        data: {
          orderId: 'order-1',
          changeType: OrderHistoryChangeType.STATUS,
          fromStatus: null,
          toStatus: OrderStatus.PENDING,
          changedBy: null,
        },
      });
    });
  });

  // ─── createFromCart — price snapshot & subtotal (TASK-057 / TASK-058) ──────

  describe('createFromCart — price snapshot & subtotal', () => {
    it('snapshots unit prices, derives the subtotal/total from those rows, and clears the cart', async () => {
      const tx = makeTx();
      tx.order.create.mockResolvedValue({ id: 'order-1', items: [] });
      tx.product.updateMany.mockResolvedValue({ count: 1 });
      prismaMock.$transaction.mockImplementation(async (cb: (t: typeof tx) => unknown) => cb(tx));

      await repository.createFromCart(baseParams);

      const { data } = tx.order.create.mock.calls[0][0] as {
        data: {
          subtotal: { toString(): string };
          total: { toString(): string };
          items: { create: Array<{ productId: string; price: { toString(): string } }> };
        };
      };

      // Each line snapshots its position's price.
      expect(data.items.create[0].price.toString()).toBe('29.99');
      expect(data.items.create[1].price.toString()).toBe('9.99');

      // subtotal = 2 × 29.99 + 1 × 9.99 = 69.97; total mirrors subtotal in the MVP.
      expect(data.subtotal.toString()).toBe('69.97');
      expect(data.total.toString()).toBe('69.97');

      // The originating cart is emptied so it cannot be ordered twice.
      expect(tx.cartItem.deleteMany).toHaveBeenCalledWith({ where: { cartId: 'cart-uuid-1' } });
    });

    it('zero-pads sub-dollar cents without float drift', async () => {
      const tx = makeTx();
      tx.order.create.mockResolvedValue({ id: 'order-1', items: [] });
      tx.product.updateMany.mockResolvedValue({ count: 1 });
      prismaMock.$transaction.mockImplementation(async (cb: (t: typeof tx) => unknown) => cb(tx));

      // Single line at 9.05 → 905 cents → "9.05" (exercises the pad branch).
      const params: CreateOrderParams = {
        ...baseParams,
        cartItems: [
          {
            ...secondItem,
            quantity: 1,
            product: { ...secondItem.product, price: { toString: () => '9.05' } as never },
          },
        ],
      };

      await repository.createFromCart(params);

      const { data } = tx.order.create.mock.calls[0][0] as {
        data: { subtotal: { toString(): string } };
      };
      expect(data.subtotal.toString()).toBe('9.05');
    });
  });

  // ─── createFromCart — add-on snapshots & the discount invariant (TASK-174) ──
  //
  // Plan 150 cases 22–24. The hard invariant under test:
  //   total = subtotal + shipping + addonsTotal - discount
  // with `discount` computed and clamped against `subtotal` ALONE — a coupon can
  // never reduce what an add-on contributes to the payable total.

  describe('createFromCart — add-on snapshots (TASK-174)', () => {
    const arrangeTx = () => {
      const tx = makeTx();
      tx.order.create.mockResolvedValue({ id: 'order-1', items: [] });
      tx.product.updateMany.mockResolvedValue({ count: 1 });
      prismaMock.$transaction.mockImplementation(async (cb: (t: typeof tx) => unknown) => cb(tx));
      return tx;
    };

    const createdData = (tx: ReturnType<typeof makeTx>) =>
      (
        tx.order.create.mock.calls[0][0] as {
          data: {
            subtotal: { toString(): string };
            discount: { toString(): string };
            shippingCost: { toString(): string };
            addonsTotal: { toString(): string };
            total: { toString(): string };
            items: {
              create: Array<{
                productId: string;
                addons?: { create: Array<{ name: string; price: { toString(): string } }> };
              }>;
            };
          };
        }
      ).data;

    it('case 22 — freezes the selected add-on onto its line and folds it into addonsTotal/total', async () => {
      const tx = arrangeTx();

      await repository.createFromCart({
        ...baseParams,
        shippingCost: 10,
        addonsByCartItemId: new Map([
          ['cart-item-1', [{ addonServiceId: 'svc-warranty', name: 'Warranty', price: '499.00' }]],
        ]),
      });

      const data = createdData(tx);

      // The add-on is snapshotted on line 1 only — line 2 has none.
      expect(data.items.create[0].addons?.create).toEqual([
        { addonServiceId: 'svc-warranty', name: 'Warranty', price: expect.anything() },
      ]);
      expect(data.items.create[0].addons?.create[0].price.toString()).toBe('499');
      expect(data.items.create[1].addons).toBeUndefined();

      // subtotal 69.97 + shipping 10 + addons 499 - discount 0
      expect(data.subtotal.toString()).toBe('69.97');
      expect(data.addonsTotal.toString()).toBe('499');
      expect(data.total.toString()).toBe('578.97');
    });

    it('charges an add-on FLAT — line quantity 2 does not double it', async () => {
      const tx = arrangeTx();

      await repository.createFromCart({
        ...baseParams,
        addonsByCartItemId: new Map([
          [
            'cart-item-1', // this line has quantity 2
            [{ addonServiceId: 'svc-warranty', name: 'Warranty', price: '499.00' }],
          ],
        ]),
      });

      expect(createdData(tx).addonsTotal.toString()).toBe('499');
    });

    it('sums add-ons across several lines with integer-cents arithmetic (no float drift)', async () => {
      const tx = arrangeTx();

      await repository.createFromCart({
        ...baseParams,
        addonsByCartItemId: new Map([
          [
            'cart-item-1',
            [
              { addonServiceId: 'svc-a', name: 'A', price: '0.10' },
              { addonServiceId: 'svc-b', name: 'B', price: '0.20' },
            ],
          ],
          ['cart-item-2', [{ addonServiceId: 'svc-c', name: 'C', price: '0.05' }]],
        ]),
      });

      expect(createdData(tx).addonsTotal.toString()).toBe('0.35');
    });

    it('writes addonsTotal 0 and no addon rows when nothing was selected', async () => {
      const tx = arrangeTx();

      await repository.createFromCart(baseParams);

      const data = createdData(tx);
      expect(data.addonsTotal.toString()).toBe('0');
      expect(data.items.create[0].addons).toBeUndefined();
      expect(data.total.toString()).toBe('69.97'); // unchanged from the pre-TASK-174 behaviour
    });

    it('case 24 — HARD INVARIANT: the discount is clamped to the SUBTOTAL, never reduced by add-ons', async () => {
      const redeem = jest.fn();

      // Run the SAME cart + SAME coupon twice: once with no add-on, once with a
      // large one. The discount amount must be byte-identical in both — only the
      // add-on's contribution to `total` may differ.
      const withoutAddons = arrangeTx();
      await repository.createFromCart({
        ...baseParams,
        discount: { amount: '20.00', code: 'SAVE20', redeem },
      });
      const plain = createdData(withoutAddons);

      const withAddons = arrangeTx();
      await repository.createFromCart({
        ...baseParams,
        discount: { amount: '20.00', code: 'SAVE20', redeem },
        addonsByCartItemId: new Map([
          [
            'cart-item-1',
            [{ addonServiceId: 'svc-insurance', name: 'Insurance', price: '899.00' }],
          ],
        ]),
      });
      const withAddon = createdData(withAddons);

      // The discount did NOT grow because the cart got more expensive via add-ons.
      expect(plain.discount.toString()).toBe('20');
      expect(withAddon.discount.toString()).toBe('20');
      expect(withAddon.subtotal.toString()).toBe(plain.subtotal.toString());

      // total = subtotal + shipping + addonsTotal - discount
      expect(plain.total.toString()).toBe('49.97'); // 69.97 + 0 + 0 - 20
      expect(withAddon.total.toString()).toBe('948.97'); // 69.97 + 0 + 899 - 20

      // The add-on's full price reached the total, undiscounted: the delta between
      // the two totals is EXACTLY the add-on price.
      expect(Number(withAddon.total.toString()) - Number(plain.total.toString())).toBeCloseTo(
        899,
        2,
      );
    });
  });

  // ─── cancelAndRestock — release reserved stock (WARNING / TASK-054) ────────

  describe('cancelAndRestock', () => {
    const seedCancelTx = () => {
      const tx = makeTx();
      tx.order.findUniqueOrThrow.mockResolvedValue({
        id: 'order-1',
        status: OrderStatus.PROCESSING,
        items: [
          { productId: 'product-uuid-1', quantity: 2 },
          { productId: 'product-uuid-2', quantity: 1 },
        ],
      });
      tx.order.update.mockResolvedValue({
        id: 'order-1',
        status: OrderStatus.CANCELLED,
        items: [],
      });
      prismaMock.$transaction.mockImplementation(async (cb: (t: typeof tx) => unknown) => cb(tx));
      return tx;
    };

    it('increments stock for each position and sets the order to CANCELLED', async () => {
      const tx = seedCancelTx();

      await repository.cancelAndRestock('order-1', 'admin-uuid-1');

      // Every position on the order is restocked.
      expect(tx.product.update).toHaveBeenCalledTimes(2);
      expect(tx.product.update).toHaveBeenCalledWith({
        where: { id: 'product-uuid-1' },
        data: { stock: { increment: 2 } },
      });
      // TASK-228: the restock is stamped so a later revive re-reserves.
      expect(tx.order.update).toHaveBeenCalledWith({
        where: { id: 'order-1' },
        data: { status: OrderStatus.CANCELLED, restockedAt: expect.any(Date) },
        include: expect.any(Object),
      });
    });

    // ── TASK-251: history row uses the pre-cancel status as fromStatus ──
    it('writes a STATUS history row (order.status → CANCELLED) in the same transaction', async () => {
      const tx = seedCancelTx();

      await repository.cancelAndRestock('order-1', 'admin-uuid-1');

      expect(tx.orderStatusHistory.create).toHaveBeenCalledWith({
        data: {
          orderId: 'order-1',
          changeType: OrderHistoryChangeType.STATUS,
          fromStatus: OrderStatus.PROCESSING,
          toStatus: OrderStatus.CANCELLED,
          changedBy: 'admin-uuid-1',
        },
      });
    });

    it('threads a null changedBy through for system-authored cancels', async () => {
      const tx = seedCancelTx();

      await repository.cancelAndRestock('order-1', null);

      expect(tx.orderStatusHistory.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ changedBy: null }) }),
      );
    });
  });

  // ─── reviveAndReserve — re-reserve stock on revive (CRITICAL / TASK-228) ────

  describe('reviveAndReserve', () => {
    const seedTx = () => {
      const tx = makeTx();
      tx.order.findUniqueOrThrow.mockResolvedValue({
        id: 'order-1',
        status: OrderStatus.CANCELLED,
        items: [
          { productId: 'product-uuid-1', quantity: 2, product: { name: 'iPhone 15 Pro Case' } },
          { productId: 'product-uuid-2', quantity: 1, product: { name: 'Screen Protector' } },
        ],
      });
      tx.order.update.mockResolvedValue({
        id: 'order-1',
        status: OrderStatus.PENDING,
        items: [{ productId: 'product-uuid-1', product: { slug: 'iphone-15-pro-case' } }],
      });
      prismaMock.$transaction.mockImplementation(async (cb: (t: typeof tx) => unknown) => cb(tx));
      return tx;
    };

    it('conditionally re-decrements stock per position, sets the new status, and clears restockedAt', async () => {
      const tx = seedTx();
      tx.product.updateMany.mockResolvedValue({ count: 1 });

      await repository.reviveAndReserve('order-1', OrderStatus.PENDING, PaymentStatus.PAID, null);

      // Same oversell guard as order creation: WHERE stock >= quantity.
      expect(tx.product.updateMany).toHaveBeenCalledTimes(2);
      expect(tx.product.updateMany).toHaveBeenCalledWith({
        where: { id: 'product-uuid-1', stock: { gte: 2 } },
        data: { stock: { decrement: 2 } },
      });
      expect(tx.order.update).toHaveBeenCalledWith({
        where: { id: 'order-1' },
        data: {
          status: OrderStatus.PENDING,
          paymentStatus: PaymentStatus.PAID,
          restockedAt: null,
        },
        include: expect.any(Object),
      });
    });

    // ── TASK-251: history row uses the pre-revive status (CANCELLED) as fromStatus ──
    it('writes a STATUS history row (order.status → revived status) in the same transaction', async () => {
      const tx = seedTx();
      tx.product.updateMany.mockResolvedValue({ count: 1 });

      await repository.reviveAndReserve(
        'order-1',
        OrderStatus.PENDING,
        PaymentStatus.PAID,
        'admin-uuid-1',
      );

      expect(tx.orderStatusHistory.create).toHaveBeenCalledWith({
        data: {
          orderId: 'order-1',
          changeType: OrderHistoryChangeType.STATUS,
          fromStatus: OrderStatus.CANCELLED,
          toStatus: OrderStatus.PENDING,
          changedBy: 'admin-uuid-1',
        },
      });
    });

    it('throws ConflictException and does not update the order when a position lacks stock', async () => {
      const tx = seedTx();
      // First line reserves fine, second line's stock is gone → whole tx throws.
      tx.product.updateMany.mockResolvedValueOnce({ count: 1 }).mockResolvedValueOnce({ count: 0 });

      await expect(
        repository.reviveAndReserve('order-1', OrderStatus.PENDING, PaymentStatus.PAID, null),
      ).rejects.toThrow(ConflictException);
      expect(tx.order.update).not.toHaveBeenCalled();
      // Nothing committed → nothing to evict.
      expect(cacheMock.delByPrefix).not.toHaveBeenCalled();
    });

    it('evicts list pages and per-product detail caches after commit', async () => {
      const tx = seedTx();
      tx.product.updateMany.mockResolvedValue({ count: 1 });

      await repository.reviveAndReserve('order-1', OrderStatus.PENDING, PaymentStatus.PAID, null);

      expect(cacheMock.delByPrefix).toHaveBeenCalledWith(PRODUCT_LIST_PREFIX);
      expect(cacheMock.del).toHaveBeenCalledWith(productDetailSlugKey('iphone-15-pro-case'));
      expect(cacheMock.del).toHaveBeenCalledWith(productDetailIdKey('product-uuid-1'));
    });
  });

  // ─── updateStatus — conditional product-cache eviction (TASK-254) ───────────

  describe('updateStatus', () => {
    const updatedOrder = {
      id: 'order-1',
      status: OrderStatus.SHIPPED,
      items: [{ productId: 'product-uuid-1', product: { slug: 'iphone-15-pro-case' } }],
    };

    // TASK-251: updateStatus is now a $transaction that persists the status AND
    // writes a history row atomically. Seed a tx whose order.update resolves the
    // updated order and drive the callback through $transaction.
    const seedTx = () => {
      const tx = makeTx();
      tx.order.update.mockResolvedValue(updatedOrder);
      prismaMock.$transaction.mockImplementation(async (cb: (t: typeof tx) => unknown) => cb(tx));
      return tx;
    };

    it('persists status/paymentStatus inside the transaction and does NOT evict when the flag is unset', async () => {
      const tx = seedTx();

      await repository.updateStatus(
        'order-1',
        OrderStatus.PROCESSING,
        OrderStatus.SHIPPED,
        PaymentStatus.PAID,
        'admin-uuid-1',
      );

      expect(tx.order.update).toHaveBeenCalledWith({
        where: { id: 'order-1' },
        data: { status: OrderStatus.SHIPPED, paymentStatus: PaymentStatus.PAID },
        include: expect.any(Object),
      });
      // Default (no options) leaves derived-stock caches untouched.
      expect(cacheMock.delByPrefix).not.toHaveBeenCalled();
      expect(cacheMock.del).not.toHaveBeenCalled();
    });

    // ── TASK-251: the status transition and the history row commit together ──
    it('writes a STATUS history row (fromStatus → toStatus) in the same transaction', async () => {
      const tx = seedTx();

      await repository.updateStatus(
        'order-1',
        OrderStatus.PROCESSING,
        OrderStatus.SHIPPED,
        PaymentStatus.PAID,
        'admin-uuid-1',
      );

      expect(tx.orderStatusHistory.create).toHaveBeenCalledWith({
        data: {
          orderId: 'order-1',
          changeType: OrderHistoryChangeType.STATUS,
          fromStatus: OrderStatus.PROCESSING,
          toStatus: OrderStatus.SHIPPED,
          changedBy: 'admin-uuid-1',
        },
      });
    });

    it('does not return the updated order (transaction rolls back) when the history insert rejects', async () => {
      const tx = makeTx();
      tx.order.update.mockResolvedValue(updatedOrder);
      tx.orderStatusHistory.create.mockRejectedValue(new Error('history insert failed'));
      // Real interactive $transaction: the callback rejection propagates and no
      // value is committed/returned.
      prismaMock.$transaction.mockImplementation(async (cb: (t: typeof tx) => unknown) => cb(tx));

      await expect(
        repository.updateStatus(
          'order-1',
          OrderStatus.PROCESSING,
          OrderStatus.SHIPPED,
          PaymentStatus.PAID,
          'admin-uuid-1',
        ),
      ).rejects.toThrow('history insert failed');
      // Rolled back → no post-commit cache eviction.
      expect(cacheMock.delByPrefix).not.toHaveBeenCalled();
    });

    it('evicts list pages and each line-item product detail cache when the flag is set', async () => {
      seedTx();

      await repository.updateStatus(
        'order-1',
        OrderStatus.PROCESSING,
        OrderStatus.SHIPPED,
        PaymentStatus.PAID,
        'admin-uuid-1',
        { evictProductStockCaches: true },
      );

      expect(cacheMock.delByPrefix).toHaveBeenCalledWith(PRODUCT_LIST_PREFIX);
      expect(cacheMock.del).toHaveBeenCalledWith(productDetailSlugKey('iphone-15-pro-case'));
      expect(cacheMock.del).toHaveBeenCalledWith(productDetailIdKey('product-uuid-1'));
    });
  });

  // ─── updatePaymentStatus — transactional history write (TASK-251) ───────────

  describe('updatePaymentStatus', () => {
    const seedTx = () => {
      const tx = makeTx();
      tx.order.findUniqueOrThrow.mockResolvedValue({ paymentStatus: PaymentStatus.PENDING });
      tx.order.update.mockResolvedValue({ id: 'order-1', items: [] });
      prismaMock.$transaction.mockImplementation(async (cb: (t: typeof tx) => unknown) => cb(tx));
      return tx;
    };

    it('updates the payment status inside a transaction', async () => {
      const tx = seedTx();

      await repository.updatePaymentStatus('order-1', PaymentStatus.PAID, 'admin-uuid-1');

      expect(tx.order.update).toHaveBeenCalledWith({
        where: { id: 'order-1' },
        data: { paymentStatus: PaymentStatus.PAID },
        include: expect.any(Object),
      });
    });

    it('writes a PAYMENT_STATUS history row (from pre-update → new) in the same transaction', async () => {
      const tx = seedTx();

      await repository.updatePaymentStatus('order-1', PaymentStatus.PAID, 'admin-uuid-1');

      // fromPaymentStatus is read from the pre-update row inside the tx.
      expect(tx.order.findUniqueOrThrow).toHaveBeenCalledWith({
        where: { id: 'order-1' },
        select: { paymentStatus: true },
      });
      expect(tx.orderStatusHistory.create).toHaveBeenCalledWith({
        data: {
          orderId: 'order-1',
          changeType: OrderHistoryChangeType.PAYMENT_STATUS,
          fromPaymentStatus: PaymentStatus.PENDING,
          toPaymentStatus: PaymentStatus.PAID,
          changedBy: 'admin-uuid-1',
        },
      });
    });
  });

  // ─── findHistoryByOrderId — chronological timeline read (TASK-251) ───────────

  describe('findHistoryByOrderId', () => {
    it('queries history rows for the order oldest-first', async () => {
      prismaMock.orderStatusHistory.findMany.mockResolvedValue([]);

      await repository.findHistoryByOrderId('order-1');

      expect(prismaMock.orderStatusHistory.findMany).toHaveBeenCalledWith({
        where: { orderId: 'order-1' },
        orderBy: { changedAt: 'asc' },
      });
    });
  });

  // ─── soft-delete read filters & tombstone (TASK-104) ───────────────────────

  describe('soft-delete behaviour', () => {
    it('findById excludes tombstoned orders via deletedAt: null', async () => {
      prismaMock.order.findFirst.mockResolvedValue(null);

      await repository.findById('order-1');

      expect(prismaMock.order.findFirst).toHaveBeenCalledWith({
        where: { id: 'order-1', deletedAt: null },
        include: expect.any(Object),
      });
    });

    it('findByUserId constrains the where clause with deletedAt: null', async () => {
      prismaMock.$transaction.mockResolvedValue([0, []]);

      await repository.findByUserId('user-1', {});

      // count + findMany are built synchronously and wrapped in $transaction.
      expect(prismaMock.order.count).toHaveBeenCalledWith({
        where: expect.objectContaining({ userId: 'user-1', deletedAt: null }),
      });
      expect(prismaMock.order.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ userId: 'user-1', deletedAt: null }),
        }),
      );
    });

    it('findAll (admin) constrains the where clause with deletedAt: null', async () => {
      prismaMock.$transaction.mockResolvedValue([0, []]);

      await repository.findAll({});

      expect(prismaMock.order.count).toHaveBeenCalledWith({
        where: expect.objectContaining({ deletedAt: null }),
      });
    });

    it('softDelete stamps deletedAt and leaves child items in place', async () => {
      prismaMock.order.update.mockResolvedValue({ id: 'order-1', items: [] });

      await repository.softDelete('order-1');

      const updateArgs = prismaMock.order.update.mock.calls[0][0];
      expect(updateArgs.where).toEqual({ id: 'order-1' });
      expect(updateArgs.data.deletedAt).toBeInstanceOf(Date);
    });
  });

  // ─── cache invalidation on stock mutations (TASK-044-H) ────────────────────

  describe('cache invalidation', () => {
    it('createFromCart evicts list pages and per-product detail caches after commit', async () => {
      const tx = makeTx();
      tx.order.create.mockResolvedValue({
        id: 'order-1',
        items: [
          { productId: 'product-uuid-1', product: { slug: 'iphone-15-pro-case' } },
          { productId: 'product-uuid-2', product: { slug: 'screen-protector' } },
        ],
      });
      tx.product.updateMany.mockResolvedValue({ count: 1 });
      prismaMock.$transaction.mockImplementation(async (cb: (t: typeof tx) => unknown) => cb(tx));

      await repository.createFromCart(baseParams);

      expect(cacheMock.delByPrefix).toHaveBeenCalledWith(PRODUCT_LIST_PREFIX);
      expect(cacheMock.del).toHaveBeenCalledWith(productDetailSlugKey('iphone-15-pro-case'));
      expect(cacheMock.del).toHaveBeenCalledWith(productDetailIdKey('product-uuid-1'));
      expect(cacheMock.del).toHaveBeenCalledWith(productDetailSlugKey('screen-protector'));
      expect(cacheMock.del).toHaveBeenCalledWith(productDetailIdKey('product-uuid-2'));
    });

    it('cancelAndRestock evicts list pages and per-product detail caches after commit', async () => {
      const tx = makeTx();
      tx.order.findUniqueOrThrow.mockResolvedValue({
        id: 'order-1',
        status: OrderStatus.PROCESSING,
        items: [{ productId: 'product-uuid-1', quantity: 2 }],
      });
      tx.order.update.mockResolvedValue({
        id: 'order-1',
        status: OrderStatus.CANCELLED,
        items: [{ productId: 'product-uuid-1', product: { slug: 'iphone-15-pro-case' } }],
      });
      prismaMock.$transaction.mockImplementation(async (cb: (t: typeof tx) => unknown) => cb(tx));

      await repository.cancelAndRestock('order-1', null);

      expect(cacheMock.delByPrefix).toHaveBeenCalledWith(PRODUCT_LIST_PREFIX);
      expect(cacheMock.del).toHaveBeenCalledWith(productDetailSlugKey('iphone-15-pro-case'));
      expect(cacheMock.del).toHaveBeenCalledWith(productDetailIdKey('product-uuid-1'));
    });
  });

  // ─── admin reads join the owning user (TASK-125) ──────────────────────────────

  describe('admin customer join', () => {
    it('findByIdForAdmin selects the owning user (id, email, names)', async () => {
      prismaMock.order.findFirst.mockResolvedValue({ id: 'order-1' });

      await repository.findByIdForAdmin('order-1');

      const arg = prismaMock.order.findFirst.mock.calls[0][0];
      expect(arg.where).toEqual({ id: 'order-1', deletedAt: null });
      expect(arg.include.user.select).toEqual({
        id: true,
        email: true,
        firstName: true,
        lastName: true,
      });
    });

    it('findAll includes the user select on the page query', async () => {
      prismaMock.$transaction.mockResolvedValue([0, []]);

      await repository.findAll({});

      // findAll runs count + findMany inside a $transaction; the array passed in
      // holds the two query builders. Assert the findMany call carried the join.
      const queries = prismaMock.$transaction.mock.calls[0][0];
      expect(prismaMock.order.findMany).toHaveBeenCalled();
      const findManyArg = prismaMock.order.findMany.mock.calls[0][0];
      expect(findManyArg.include.user.select).toMatchObject({ email: true });
      expect(queries).toHaveLength(2);
    });
  });

  describe('findAll — unpaidInTransit filter (TASK-248)', () => {
    it('merges the active-but-unpaid compound condition when unpaidInTransit is true', async () => {
      prismaMock.$transaction.mockResolvedValue([0, []]);

      await repository.findAll({ unpaidInTransit: true });

      const where = prismaMock.order.count.mock.calls[0][0].where;
      // paymentStatus != PAID AND status NOT IN (CANCELLED, REFUNDED).
      expect(where.paymentStatus).toEqual({ not: PaymentStatus.PAID });
      expect(where.status).toEqual({
        notIn: [OrderStatus.CANCELLED, OrderStatus.REFUNDED],
      });
      // Still excludes soft-deleted orders.
      expect(where.deletedAt).toBeNull();
    });

    it('composes the unpaidInTransit filter with the created-at date range', async () => {
      prismaMock.$transaction.mockResolvedValue([0, []]);

      await repository.findAll({ unpaidInTransit: true, dateFrom: '2026-01-01' });

      const where = prismaMock.order.count.mock.calls[0][0].where;
      expect(where.paymentStatus).toEqual({ not: PaymentStatus.PAID });
      expect(where.status).toEqual({
        notIn: [OrderStatus.CANCELLED, OrderStatus.REFUNDED],
      });
      expect(where.createdAt).toEqual({ gte: new Date('2026-01-01') });
    });

    it('does not add the payment/status compound condition when the flag is absent', async () => {
      prismaMock.$transaction.mockResolvedValue([0, []]);

      await repository.findAll({});

      const where = prismaMock.order.count.mock.calls[0][0].where;
      expect(where.paymentStatus).toBeUndefined();
      expect(where.status).toBeUndefined();
    });
  });

  describe('findAll — multi-status filter (TASK-250)', () => {
    it('maps a single-status array to status: { in: [...] }', async () => {
      prismaMock.$transaction.mockResolvedValue([0, []]);

      await repository.findAll({ status: [OrderStatus.PENDING] });

      expect(prismaMock.order.count).toHaveBeenCalledWith({
        where: expect.objectContaining({ status: { in: [OrderStatus.PENDING] } }),
      });
      expect(prismaMock.order.findMany.mock.calls[0][0].where).toEqual(
        expect.objectContaining({ status: { in: [OrderStatus.PENDING] } }),
      );
    });

    it('maps a two-status array to status: { in: [...] }', async () => {
      prismaMock.$transaction.mockResolvedValue([0, []]);

      await repository.findAll({ status: [OrderStatus.CONFIRMED, OrderStatus.PROCESSING] });

      expect(prismaMock.order.findMany.mock.calls[0][0].where).toEqual(
        expect.objectContaining({
          status: { in: [OrderStatus.CONFIRMED, OrderStatus.PROCESSING] },
        }),
      );
    });

    it('omits the status key entirely when status is absent', async () => {
      prismaMock.$transaction.mockResolvedValue([0, []]);

      await repository.findAll({});

      expect(prismaMock.order.findMany.mock.calls[0][0].where).not.toHaveProperty('status');
    });

    it('omits the status key entirely when status is an empty array', async () => {
      prismaMock.$transaction.mockResolvedValue([0, []]);

      await repository.findAll({ status: [] });

      expect(prismaMock.order.findMany.mock.calls[0][0].where).not.toHaveProperty('status');
    });
  });

  describe('findAll — sorting (TASK-147)', () => {
    it('defaults to createdAt desc when no sort is provided', async () => {
      prismaMock.$transaction.mockResolvedValue([0, []]);

      await repository.findAll({});

      expect(prismaMock.order.findMany.mock.calls[0][0].orderBy).toEqual({
        createdAt: 'desc',
      });
    });

    it('sorts by an allow-listed field + order', async () => {
      prismaMock.$transaction.mockResolvedValue([0, []]);

      await repository.findAll({ sortBy: 'total', sortOrder: 'asc' });

      expect(prismaMock.order.findMany.mock.calls[0][0].orderBy).toEqual({
        total: 'asc',
      });
    });

    it('falls back to createdAt for an unknown sort field', async () => {
      prismaMock.$transaction.mockResolvedValue([0, []]);

      await repository.findAll({ sortBy: 'bogus', sortOrder: 'asc' });

      expect(prismaMock.order.findMany.mock.calls[0][0].orderBy).toEqual({
        createdAt: 'asc',
      });
    });
  });
});
