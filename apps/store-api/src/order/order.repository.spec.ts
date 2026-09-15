import { ConflictException } from '@nestjs/common';
import {
  OrderStatus,
  PaymentStatus,
  PaymentMethod,
  PaymentAttemptStatus,
  OrderHistoryChangeType,
} from '@prisma/client';
import { PENDING_STALE_HOURS } from '../dashboard/dashboard.types';
import { OrderRepository } from './order.repository';
import { PrismaService } from '../prisma';
import {
  CacheService,
  productDetailIdKey,
  productDetailSlugKey,
  PRODUCT_LIST_PREFIX,
} from '../cache';
import { ProductIndexer } from '../search/product-indexer';
import type { CreateOrderParams } from './order.types';
import type { CartWithItems } from '../cart/cart.repository';

// ─── CacheService mock ────────────────────────────────────────────────────────

const cacheMock = {
  get: jest.fn().mockResolvedValue(null),
  set: jest.fn().mockResolvedValue(undefined),
  del: jest.fn().mockResolvedValue(undefined),
  delByPrefix: jest.fn().mockResolvedValue(undefined),
};

// ─── ProductIndexer mock (TASK-417: stock movement must refresh `inStock`) ────

const productIndexerMock = {
  index: jest.fn().mockResolvedValue(undefined),
  remove: jest.fn().mockResolvedValue(undefined),
};

// ─── Prisma mock ────────────────────────────────────────────────────────────

const makeTx = () => ({
  order: {
    create: jest.fn(),
    update: jest.fn(),
    updateMany: jest.fn(),
    findUniqueOrThrow: jest.fn(),
  },
  cartItem: {
    deleteMany: jest.fn(),
  },
  product: {
    updateMany: jest.fn(),
    update: jest.fn(),
  },
  // TASK-330: the payment attempt is settled in the same transaction as the order.
  payment: {
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
    // TASK-485: claiming guest orders onto a freshly-verified account.
    updateMany: jest.fn(),
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
    productIndexerMock.index.mockResolvedValue(undefined);
    repository = new OrderRepository(
      prismaMock as unknown as PrismaService,
      cacheMock as unknown as CacheService,
      productIndexerMock as unknown as ProductIndexer,
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
    /**
     * `won` = whether this transaction's conditional cancel claimed the order.
     * TASK-315 made that conditional updateMany the arbiter between two racing
     * cancels; a loser must return without incrementing any stock.
     */
    const seedCancelTx = ({ won = true }: { won?: boolean } = {}) => {
      const tx = makeTx();
      tx.order.findUniqueOrThrow
        .mockResolvedValueOnce({
          id: 'order-1',
          status: OrderStatus.PROCESSING,
          items: [
            { productId: 'product-uuid-1', quantity: 2 },
            { productId: 'product-uuid-2', quantity: 1 },
          ],
        })
        // Re-read after the flip, to return the updated order with its includes.
        .mockResolvedValue({
          id: 'order-1',
          status: OrderStatus.CANCELLED,
          items: [],
        });
      tx.order.updateMany.mockResolvedValue({ count: won ? 1 : 0 });
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
      // TASK-315: guarded on restockedAt IS NULL, so it can only ever fire once.
      expect(tx.order.updateMany).toHaveBeenCalledWith({
        where: { id: 'order-1', restockedAt: null },
        data: { status: OrderStatus.CANCELLED, restockedAt: expect.any(Date) },
      });
    });

    // The regression this guard exists for: a losing concurrent cancel must not
    // credit stock back a second time. The integration suite proves it against a
    // real Postgres; this proves the code path takes the early exit.
    it('touches no stock when a concurrent cancel already claimed the order', async () => {
      const tx = seedCancelTx({ won: false });

      await expect(repository.cancelAndRestock('order-1', 'admin-uuid-1')).rejects.toThrow(
        ConflictException,
      );

      expect(tx.product.update).not.toHaveBeenCalled();
      expect(tx.orderStatusHistory.create).not.toHaveBeenCalled();
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

    // The search index is the third read model derived from `stock`. Since
    // TASK-417 `inStock` is a Meilisearch facet, so a stock movement that skips
    // the reindex leaves `/search?inStock=true` disagreeing with the PDP about
    // the same product.
    it('refreshes the search document of every product whose stock moved', async () => {
      const tx = seedTx();
      tx.product.updateMany.mockResolvedValue({ count: 1 });

      await repository.reviveAndReserve('order-1', OrderStatus.PENDING, PaymentStatus.PAID, null);

      expect(productIndexerMock.index).toHaveBeenCalledWith('product-uuid-1');
    });

    it('does not fail the write when the search engine is unreachable', async () => {
      const tx = seedTx();
      tx.product.updateMany.mockResolvedValue({ count: 1 });
      productIndexerMock.index.mockRejectedValueOnce(new Error('ECONNREFUSED'));

      await expect(
        repository.reviveAndReserve('order-1', OrderStatus.PENDING, PaymentStatus.PAID, null),
      ).resolves.toBeDefined();
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
    // writes a history row atomically. TASK-332 split the write from the read —
    // the write may be conditional on the caller's version — so the committed
    // order comes from a findUniqueOrThrow at the end of the transaction.
    const seedTx = () => {
      const tx = makeTx();
      tx.order.update.mockResolvedValue(updatedOrder);
      tx.order.updateMany.mockResolvedValue({ count: 1 });
      tx.order.findUniqueOrThrow.mockResolvedValue(updatedOrder);
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
      });
      // No version supplied → the plain unconditional write, not the guarded one.
      expect(tx.order.updateMany).not.toHaveBeenCalled();
      // Default (no options) leaves derived-stock caches untouched.
      expect(cacheMock.delByPrefix).not.toHaveBeenCalled();
      expect(cacheMock.del).not.toHaveBeenCalled();
    });

    // ── TASK-332: optimistic locking on updatedAt (edge case E-11) ──────────────
    // The service already compared versions before calling, but that read sits
    // outside this transaction — two admins clicking at the same moment both pass
    // it. Putting the version into the WHERE makes the row lock the arbiter.

    it('guards the write with the caller version when expectedUpdatedAt is supplied', async () => {
      const tx = seedTx();
      const expectedUpdatedAt = new Date('2026-07-28T10:15:30.000Z');

      await repository.updateStatus(
        'order-1',
        OrderStatus.PROCESSING,
        OrderStatus.SHIPPED,
        PaymentStatus.PAID,
        'admin-uuid-1',
        { expectedUpdatedAt },
      );

      expect(tx.order.updateMany).toHaveBeenCalledWith({
        where: { id: 'order-1', updatedAt: expectedUpdatedAt },
        data: { status: OrderStatus.SHIPPED, paymentStatus: PaymentStatus.PAID },
      });
      expect(tx.order.update).not.toHaveBeenCalled();
    });

    it('throws ORDER_STALE and writes no history when the guarded write matches no row', async () => {
      const tx = seedTx();
      tx.order.updateMany.mockResolvedValue({ count: 0 });

      await expect(
        repository.updateStatus(
          'order-1',
          OrderStatus.PROCESSING,
          OrderStatus.SHIPPED,
          PaymentStatus.PAID,
          'admin-uuid-1',
          { expectedUpdatedAt: new Date('2026-07-28T10:15:30.000Z') },
        ),
      ).rejects.toThrow(ConflictException);

      // The losing admin's click must leave no trace — a history row is evidence
      // that a change happened, and this one did not.
      expect(tx.orderStatusHistory.create).not.toHaveBeenCalled();
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
      // First call reads the pre-update status for the history row; the last one
      // re-reads the joined order to return.
      tx.order.findUniqueOrThrow
        .mockResolvedValueOnce({ paymentStatus: PaymentStatus.PENDING })
        .mockResolvedValue({ id: 'order-1', items: [] });
      tx.order.update.mockResolvedValue({ id: 'order-1', items: [] });
      tx.order.updateMany.mockResolvedValue({ count: 1 });
      prismaMock.$transaction.mockImplementation(async (cb: (t: typeof tx) => unknown) => cb(tx));
      return tx;
    };

    it('updates the payment status inside a transaction', async () => {
      const tx = seedTx();

      await repository.updatePaymentStatus('order-1', PaymentStatus.PAID, 'admin-uuid-1');

      expect(tx.order.update).toHaveBeenCalledWith({
        where: { id: 'order-1' },
        data: { paymentStatus: PaymentStatus.PAID },
      });
    });

    // ── The compare-and-set (review of plan 180) ──────────────────────────────
    // The service validates against a status read in an earlier query. Two
    // operators picking DIFFERENT legal moves in the same second both pass that
    // validation, and the second write lands on a row the first already moved —
    // composing two legal moves into a transition the table forbids, and leaving
    // two history rows that claim the same starting point.

    it('pins the write to the status the caller validated against', async () => {
      const tx = seedTx();

      await repository.updatePaymentStatus('order-1', PaymentStatus.REFUNDED, 'admin-uuid-1', {
        expectedFrom: PaymentStatus.PAID,
      });

      expect(tx.order.updateMany).toHaveBeenCalledWith({
        where: { id: 'order-1', paymentStatus: PaymentStatus.PAID },
        data: { paymentStatus: PaymentStatus.REFUNDED },
      });
      // The unconditional door stays shut when a premise was declared.
      expect(tx.order.update).not.toHaveBeenCalled();
    });

    it('writes nothing — not even history — when the premise is gone', async () => {
      const tx = seedTx();
      tx.order.updateMany.mockResolvedValue({ count: 0 });

      const result = await repository.updatePaymentStatus(
        'order-1',
        PaymentStatus.REFUNDED,
        'admin-uuid-1',
        { expectedFrom: PaymentStatus.PAID },
      );

      expect(result).toBeNull();
      // A change that did not take effect is not an event.
      expect(tx.orderStatusHistory.create).not.toHaveBeenCalled();
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

  // ─── applyPaymentOutcome — one transaction, no acting user (TASK-330) ───────
  // The service decides; this method only writes. What matters here is that
  // everything lands together and that the audit trail says "system", because a
  // callback has no acting user and inventing one puts a lie in the record.

  describe('applyPaymentOutcome', () => {
    const seedTx = () => {
      const tx = makeTx();
      tx.order.findUniqueOrThrow.mockResolvedValue({ id: 'order-1', items: [] });
      prismaMock.$transaction.mockImplementation(async (cb: (t: typeof tx) => unknown) => cb(tx));
      return tx;
    };

    const successPlan = {
      paymentId: 'payment-1',
      orderId: 'order-1',
      attemptStatus: PaymentAttemptStatus.SUCCEEDED,
      providerPaymentId: 'liqpay-9001',
      settledAt: new Date('2026-07-28T10:30:00.000Z'),
      paymentStatusChange: { from: PaymentStatus.PENDING, to: PaymentStatus.PAID },
      paidAt: new Date('2026-07-28T10:30:00.000Z'),
      clearReservation: true,
      statusChange: { from: OrderStatus.PENDING, to: OrderStatus.CONFIRMED },
    };

    it('settles the attempt with the provider id it learned', async () => {
      const tx = seedTx();

      await repository.applyPaymentOutcome(successPlan);

      expect(tx.payment.update).toHaveBeenCalledWith({
        where: { id: 'payment-1' },
        data: expect.objectContaining({
          status: PaymentAttemptStatus.SUCCEEDED,
          providerPaymentId: 'liqpay-9001',
          settledAt: successPlan.settledAt,
        }),
      });
    });

    it('moves payment status, order status, paidAt and the reservation in ONE order update', async () => {
      const tx = seedTx();

      await repository.applyPaymentOutcome(successPlan);

      expect(tx.order.update).toHaveBeenCalledWith({
        where: { id: 'order-1' },
        data: {
          paymentStatus: PaymentStatus.PAID,
          status: OrderStatus.CONFIRMED,
          paidAt: successPlan.paidAt,
          // A paid order's reservation is no longer provisional — leaving this set
          // would let the auto-cancel worker cancel an order that is already paid.
          reservationExpiresAt: null,
        },
      });
    });

    it('writes both history rows with changedBy null (a callback has no acting user)', async () => {
      const tx = seedTx();

      await repository.applyPaymentOutcome(successPlan);

      expect(tx.orderStatusHistory.create).toHaveBeenCalledWith({
        data: {
          orderId: 'order-1',
          changeType: OrderHistoryChangeType.PAYMENT_STATUS,
          fromPaymentStatus: PaymentStatus.PENDING,
          toPaymentStatus: PaymentStatus.PAID,
          changedBy: null,
        },
      });
      expect(tx.orderStatusHistory.create).toHaveBeenCalledWith({
        data: {
          orderId: 'order-1',
          changeType: OrderHistoryChangeType.STATUS,
          fromStatus: OrderStatus.PENDING,
          toStatus: OrderStatus.CONFIRMED,
          changedBy: null,
        },
      });
    });

    it('writes no STATUS row when the plan carries no status move', async () => {
      const tx = seedTx();
      const planWithoutStatusMove = { ...successPlan, statusChange: undefined };

      await repository.applyPaymentOutcome(planWithoutStatusMove);

      expect(tx.orderStatusHistory.create).toHaveBeenCalledTimes(1);
      expect(tx.orderStatusHistory.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ changeType: OrderHistoryChangeType.PAYMENT_STATUS }),
        }),
      );
    });

    it('touches the order at all only when the plan changes something on it', async () => {
      const tx = seedTx();

      // A failed attempt on an already-paid order: the attempt is recorded, the
      // order is not touched.
      await repository.applyPaymentOutcome({
        paymentId: 'payment-1',
        orderId: 'order-1',
        attemptStatus: PaymentAttemptStatus.FAILED,
        failureCode: '4159',
        failureMessage: 'Card declined',
      });

      expect(tx.payment.update).toHaveBeenCalled();
      expect(tx.order.update).not.toHaveBeenCalled();
      expect(tx.orderStatusHistory.create).not.toHaveBeenCalled();
    });

    it('rolls back everything when a write inside the transaction rejects', async () => {
      const tx = makeTx();
      tx.orderStatusHistory.create.mockRejectedValue(new Error('history insert failed'));
      prismaMock.$transaction.mockImplementation(async (cb: (t: typeof tx) => unknown) => cb(tx));

      await expect(repository.applyPaymentOutcome(successPlan)).rejects.toThrow(
        'history insert failed',
      );
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
      // The sale case: without this the last unit of a product stays listed
      // under «В наявності» on `/search` while the PDP calls it sold out.
      expect(productIndexerMock.index).toHaveBeenCalledWith('product-uuid-1');
      expect(productIndexerMock.index).toHaveBeenCalledWith('product-uuid-2');
    });

    it('cancelAndRestock evicts list pages and per-product detail caches after commit', async () => {
      const tx = makeTx();
      tx.order.findUniqueOrThrow
        .mockResolvedValueOnce({
          id: 'order-1',
          status: OrderStatus.PROCESSING,
          items: [{ productId: 'product-uuid-1', quantity: 2 }],
        })
        // Re-read after the conditional flip (TASK-315).
        .mockResolvedValue({
          id: 'order-1',
          status: OrderStatus.CANCELLED,
          items: [{ productId: 'product-uuid-1', product: { slug: 'iphone-15-pro-case' } }],
        });
      tx.order.updateMany.mockResolvedValue({ count: 1 });
      prismaMock.$transaction.mockImplementation(async (cb: (t: typeof tx) => unknown) => cb(tx));

      await repository.cancelAndRestock('order-1', null);

      expect(cacheMock.delByPrefix).toHaveBeenCalledWith(PRODUCT_LIST_PREFIX);
      expect(cacheMock.del).toHaveBeenCalledWith(productDetailSlugKey('iphone-15-pro-case'));
      expect(cacheMock.del).toHaveBeenCalledWith(productDetailIdKey('product-uuid-1'));
      // The mirror case: a cancel puts stock back, so the product has to return
      // to «В наявності» on `/search` without waiting for an admin edit.
      expect(productIndexerMock.index).toHaveBeenCalledWith('product-uuid-1');
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
      // "money we still expect" AND status NOT IN (CANCELLED, REFUNDED).
      // PARTIALLY_REFUNDED sits with PAID: it is only reachable FROM PAID, so
      // the money arrived and the shop is owed nothing.
      expect(where.paymentStatus).toEqual({
        notIn: [PaymentStatus.PAID, PaymentStatus.PARTIALLY_REFUNDED],
      });
      expect(where.status).toEqual({
        notIn: [OrderStatus.CANCELLED, OrderStatus.REFUNDED],
      });
      // Still excludes soft-deleted orders.
      expect(where.deletedAt).toBeNull();
    });

    it('does not count a partially refunded order as unpaid', async () => {
      prismaMock.$transaction.mockResolvedValue([0, []]);

      await repository.findAll({ unpaidInTransit: true });

      const where = prismaMock.order.count.mock.calls[0][0].where;
      expect(where.paymentStatus.notIn).toContain(PaymentStatus.PARTIALLY_REFUNDED);
    });

    it('composes the unpaidInTransit filter with the created-at date range', async () => {
      prismaMock.$transaction.mockResolvedValue([0, []]);

      await repository.findAll({ unpaidInTransit: true, dateFrom: '2026-01-01' });

      const where = prismaMock.order.count.mock.calls[0][0].where;
      expect(where.paymentStatus).toEqual({
        notIn: [PaymentStatus.PAID, PaymentStatus.PARTIALLY_REFUNDED],
      });
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

    // ── TASK-336: free-text search across account AND guest orders ────────────
    // An operator on the phone has an order number, an email or a phone. Since
    // guest checkout the customer's details may live on the ORDER rather than on
    // a user row, so both places must be searched or half the orders vanish.

    describe('search', () => {
      const whereFor = async (query: Parameters<typeof repository.findAll>[0]) => {
        prismaMock.$transaction.mockResolvedValue([0, []]);
        await repository.findAll(query);
        return prismaMock.order.count.mock.calls[0][0].where;
      };

      it('matches the order number as a lower-cased id prefix', async () => {
        // Every email and screen shows the order number as the first 8 chars of
        // the uuid, UPPERCASED. The operator reads back "ABC12345"; the column
        // holds "abc12345…".
        const where = await whereFor({ search: 'ABC12345' });

        expect(where.OR).toContainEqual({ id: { startsWith: 'abc12345' } });
      });

      it('searches the guest email and the account email, case-insensitively', async () => {
        const where = await whereFor({ search: 'Olena@Example.com' });

        expect(where.OR).toContainEqual({
          guestEmail: { contains: 'Olena@Example.com', mode: 'insensitive' },
        });
        expect(where.OR).toContainEqual({
          user: { email: { contains: 'Olena@Example.com', mode: 'insensitive' } },
        });
      });

      // ── TASK-466: the phone arms match the NORMALISED term ──────────────────
      // The columns hold only `380XXXXXXXXX` now, so `contains` on the raw term
      // found nothing whenever the operator typed the number the way a customer
      // dictates it.

      it('searches the guest phone and the account phone, normalising the term', async () => {
        const where = await whereFor({ search: '0671112233' });

        expect(where.OR).toContainEqual({ guestPhone: { contains: '380671112233' } });
        expect(where.OR).toContainEqual({ user: { phone: { contains: '380671112233' } } });
      });

      it.each([
        ['050 111 2233', '380501112233', 'dictated with spaces, domestic form'],
        ['+380 50 111 2233', '380501112233', 'the mask the storefront renders'],
        ['0501112233', '380501112233', 'domestic, no separators'],
        ['0501', '380501', 'a leading fragment — still a prefix of the stored value'],
        ['1112233', '1112233', 'a trailing fragment — matches mid-string, unprefixed'],
      ])('%s searches for %s (%s)', async (search, expected) => {
        const where = await whereFor({ search });

        expect(where.OR).toContainEqual({ guestPhone: { contains: expected } });
        expect(where.OR).toContainEqual({ user: { phone: { contains: expected } } });
      });

      /**
       * The trap this guard exists for: `normalizeUaPhone('ivan')` is `''`, and
       * `{ contains: '' }` matches every row — a search for a customer's name
       * would have quietly returned the entire order table.
       */
      it.each([['ivan'], ['Олена'], ['olena@example.com'], ['ORD'], ['']])(
        'adds no phone arm for %s, which carries no number',
        async (search) => {
          const where = await whereFor({ search });

          const arms = JSON.stringify(where.OR ?? []);
          expect(arms).not.toContain('guestPhone');
          expect(arms).not.toContain('"phone"');
        },
      );

      it('adds no OR clause at all when nothing was searched for', async () => {
        const where = await whereFor({});

        expect(where.OR).toBeUndefined();
      });

      it('still excludes soft-deleted orders while searching', async () => {
        const where = await whereFor({ search: 'anything' });

        expect(where.deletedAt).toBeNull();
      });
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

  // ── TASK-425: the queue filters ──────────────────────────────────────────
  // Payment status, payment method, and "waiting too long". The first two are
  // ordinary equality filters; the third shares the DASHBOARD's threshold, which
  // is the whole point — a chip that disagreed with the tile would be worse than
  // no chip.

  describe('findAll — payment + overdue filters (TASK-425)', () => {
    const whereFor = async (query: Parameters<typeof repository.findAll>[0]) => {
      prismaMock.$transaction.mockResolvedValue([0, []]);
      await repository.findAll(query);
      return prismaMock.order.count.mock.calls[0][0].where;
    };

    it('filters by payment status', async () => {
      const where = await whereFor({ paymentStatus: PaymentStatus.FAILED });

      expect(where.AND).toContainEqual({ paymentStatus: PaymentStatus.FAILED });
    });

    it('filters by payment method', async () => {
      const where = await whereFor({ paymentMethod: PaymentMethod.ONLINE });

      expect(where.AND).toContainEqual({ paymentMethod: PaymentMethod.ONLINE });
    });

    it('keeps an explicit payment status alongside the unpaidInTransit preset', async () => {
      // The preset OWNS `where.paymentStatus`; the explicit filter lives in AND.
      // Assigning both to the same key would have made one silently vanish.
      const where = await whereFor({
        unpaidInTransit: true,
        paymentStatus: PaymentStatus.PENDING,
      });

      expect(where.paymentStatus).toEqual({
        notIn: [PaymentStatus.PAID, PaymentStatus.PARTIALLY_REFUNDED],
      });
      expect(where.AND).toContainEqual({ paymentStatus: PaymentStatus.PENDING });
    });

    it('filters overdue PENDING orders using the dashboard threshold', async () => {
      const before = Date.now();
      const where = await whereFor({ pendingOverdue: true });
      const after = Date.now();

      const clause = (where.AND as Array<{ status: string; createdAt: { lt: Date } }>)[0];
      expect(clause.status).toBe(OrderStatus.PENDING);
      // The cut-off is PENDING_STALE_HOURS ago — asserted as a window rather than
      // an exact instant, since the repository reads the clock itself.
      const staleMs = PENDING_STALE_HOURS * 60 * 60 * 1000;
      expect(clause.createdAt.lt.getTime()).toBeGreaterThanOrEqual(before - staleMs);
      expect(clause.createdAt.lt.getTime()).toBeLessThanOrEqual(after - staleMs);
    });

    it('adds no AND clause when none of the three filters is set', async () => {
      const where = await whereFor({});

      expect(where.AND).toBeUndefined();
    });

    it('composes every queue filter at once', async () => {
      const where = await whereFor({
        paymentStatus: PaymentStatus.PENDING,
        paymentMethod: PaymentMethod.ON_DELIVERY,
        pendingOverdue: true,
      });

      expect(where.AND).toHaveLength(3);
    });
  });

  describe('findAllForExport (TASK-425)', () => {
    it('applies the SAME where clause as the list, capped and newest-first', async () => {
      prismaMock.order.findMany.mockResolvedValue([]);

      await repository.findAllForExport(
        { search: 'ABC12345', paymentStatus: PaymentStatus.PAID },
        5000,
      );

      const call = prismaMock.order.findMany.mock.calls[0][0];
      expect(call.where.deletedAt).toBeNull();
      expect(call.where.OR).toContainEqual({ id: { startsWith: 'abc12345' } });
      expect(call.where.AND).toContainEqual({ paymentStatus: PaymentStatus.PAID });
      expect(call.orderBy).toEqual({ createdAt: 'desc' });
      expect(call.take).toBe(5000);
    });

    it('reads one row per ORDER — never the admin include', async () => {
      prismaMock.order.findMany.mockResolvedValue([]);

      await repository.findAllForExport({}, 10);

      const call = prismaMock.order.findMany.mock.calls[0][0];
      // A `select`, not an `include`: the export reads thousands of orders, and
      // the admin include would drag every line, add-on, product and image along.
      expect(call.include).toBeUndefined();
      expect(call.select.items).toBeUndefined();
      expect(call.select._count).toEqual({ select: { items: true } });
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

  /**
   * The derived-mark filters (TASK-470 / 471).
   *
   * Two properties are worth a test each, and they are different properties.
   *
   * The first is that every one of them goes through the `AND` array. TASK-579
   * is an open defect exactly here: `unpaidInTransit` assigns `where.status` and
   * `where.paymentStatus` directly, over the top of whatever the literal above
   * already put there. A mark filter written the same way would be swallowed
   * whole by a preset the operator had also switched on — and a filter that is
   * visibly lit on screen while being absent from the query is worse than one
   * that never worked at all.
   *
   * The second is that the conditions ARE the catalogue's. These are the same
   * four sentences the admin panel re-states to decide which chip to draw on a
   * row; if the two ever disagree, the list shows rows without the chip that put
   * them there.
   */
  describe('findAll — the derived-mark filters (TASK-470/471)', () => {
    const NOW = new Date('2026-09-14T12:00:00.000Z');

    const whereFor = async (query: Parameters<typeof repository.findAll>[0]) => {
      prismaMock.$transaction.mockResolvedValue([0, []]);
      await repository.findAll(query);
      return prismaMock.order.count.mock.calls[0][0].where;
    };

    beforeEach(() => {
      jest.useFakeTimers().setSystemTime(NOW);
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it('«Борг» is DELIVERED and paid neither fully nor back', async () => {
      const where = await whereFor({ hasDebt: true });

      expect(where.AND).toContainEqual({
        status: OrderStatus.DELIVERED,
        paymentStatus: { notIn: [PaymentStatus.PAID, PaymentStatus.REFUNDED] },
      });
    });

    it('«Очікує оплати» is an ONLINE PENDING order whose deadline is still ahead', async () => {
      const where = await whereFor({ awaitingPayment: true });

      expect(where.AND).toContainEqual({
        paymentMethod: PaymentMethod.ONLINE,
        paymentStatus: PaymentStatus.PENDING,
        reservationExpiresAt: { gt: NOW },
      });
    });

    it('«Резерв сплив» is the same triple with the deadline behind us', async () => {
      const where = await whereFor({ reservationExpired: true });

      expect(where.AND).toContainEqual({
        paymentMethod: PaymentMethod.ONLINE,
        paymentStatus: PaymentStatus.PENDING,
        reservationExpiresAt: { lte: NOW },
      });
    });

    it('splits the reservation window at ONE instant, not two', async () => {
      // `gt` and `lte` against the same `now`, so an order cannot fall into both
      // halves or into neither because the clock moved between two `new Date()`s.
      const where = await whereFor({ awaitingPayment: true, reservationExpired: true });

      const deadlines = (where.AND as Array<Record<string, unknown>>)
        .map((clause) => clause.reservationExpiresAt)
        .filter(Boolean);
      expect(deadlines).toEqual([{ gt: NOW }, { lte: NOW }]);
    });

    it('«Позиція недоступна» asks about the product, and skips ended orders', async () => {
      const where = await whereFor({ hasUnavailableItems: true });

      expect(where.AND).toContainEqual({
        status: { notIn: [OrderStatus.CANCELLED, OrderStatus.REFUNDED] },
        OR: [
          {
            items: {
              some: {
                product: {
                  OR: [{ deletedAt: { not: null } }, { isActive: false }, { stock: { lt: 0 } }],
                },
              },
            },
          },
          { restockedAt: { not: null } },
        ],
      });
    });

    it('survives the unpaidInTransit preset instead of being overwritten by it', async () => {
      // TASK-579's failure mode, asserted rather than assumed: the preset owns
      // `where.status` outright, so a mark condition written onto `where` would
      // vanish here without a sound.
      const where = await whereFor({ unpaidInTransit: true, hasDebt: true });

      expect(where.status).toEqual({ notIn: [OrderStatus.CANCELLED, OrderStatus.REFUNDED] });
      expect(where.AND).toContainEqual({
        status: OrderStatus.DELIVERED,
        paymentStatus: { notIn: [PaymentStatus.PAID, PaymentStatus.REFUNDED] },
      });
    });

    it('adds no AND clause at all when no mark is filtered on', async () => {
      const where = await whereFor({});

      expect(where.AND).toBeUndefined();
    });
  });

  /**
   * TASK-470: the admin read has to JOIN what the mark is derived from.
   *
   * Without these three columns `OrderEntity` reports `unavailableItemIds` as
   * absent — which is the correct answer to a question that was never asked, and
   * means the chip silently never renders. The failure is invisible from the UI
   * side: the field is optional, so nothing throws and nothing logs.
   */
  describe('findAll — the availability join (TASK-470)', () => {
    it('joins deletedAt / isActive / stock on each line product', async () => {
      prismaMock.$transaction.mockResolvedValue([0, []]);

      await repository.findAll({});

      const include = prismaMock.order.findMany.mock.calls[0][0].include;
      expect(include.items.select.product.select).toMatchObject({
        deletedAt: true,
        isActive: true,
        stock: true,
      });
    });

    it('keeps the fields the order card already renders', async () => {
      prismaMock.$transaction.mockResolvedValue([0, []]);

      await repository.findAll({});

      const include = prismaMock.order.findMany.mock.calls[0][0].include;
      expect(include.items.select.product.select).toMatchObject({
        name: true,
        slug: true,
      });
      expect(include.items.select.addons).toBeDefined();
    });
  });

  // ─── claimGuestOrders (TASK-338, wired by TASK-485) ─────────────────────────

  describe('claimGuestOrders', () => {
    beforeEach(() => {
      prismaMock.order.updateMany.mockResolvedValue({ count: 2 });
    });

    it('writes ONLY the owner — the guest contact columns are left alone', async () => {
      await repository.claimGuestOrders('user-uuid-1', 'guest@example.com');

      // B-5 §5: the guest block is the snapshot of what was actually typed at
      // checkout, and it is what the emailed status link and the public
      // number+phone form (TASK-483) still answer to. Clearing it on claim would
      // silently rewrite history and break both of those routes into the order.
      const { data } = prismaMock.order.updateMany.mock.calls[0][0];
      expect(data).toEqual({ userId: 'user-uuid-1' });
    });

    it('claims only unowned, live orders placed with that exact address', async () => {
      await repository.claimGuestOrders('user-uuid-1', 'guest@example.com');

      const { where } = prismaMock.order.updateMany.mock.calls[0][0];
      // `userId: null` is what makes the call idempotent AND is the security
      // boundary: without it, verifying an address would reassign orders that
      // already belong to somebody else.
      expect(where).toEqual({
        userId: null,
        guestEmail: 'guest@example.com',
        deletedAt: null,
      });
    });

    it('reports how many moved, so the caller can say so', async () => {
      await expect(repository.claimGuestOrders('user-uuid-1', 'guest@example.com')).resolves.toBe(
        2,
      );
    });
  });
});
