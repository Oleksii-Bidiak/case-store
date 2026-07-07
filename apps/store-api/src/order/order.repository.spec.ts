import { ConflictException } from '@nestjs/common';
import { OrderStatus, PaymentStatus } from '@prisma/client';
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
});

const prismaMock = {
  $transaction: jest.fn(),
  order: {
    findFirst: jest.fn(),
    findMany: jest.fn(),
    count: jest.fn(),
    update: jest.fn(),
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

  // ─── cancelAndRestock — release reserved stock (WARNING / TASK-054) ────────

  describe('cancelAndRestock', () => {
    it('increments stock for each position and sets the order to CANCELLED', async () => {
      const tx = makeTx();
      tx.order.findUniqueOrThrow.mockResolvedValue({
        id: 'order-1',
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

      await repository.cancelAndRestock('order-1');

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
  });

  // ─── reviveAndReserve — re-reserve stock on revive (CRITICAL / TASK-228) ────

  describe('reviveAndReserve', () => {
    const seedTx = () => {
      const tx = makeTx();
      tx.order.findUniqueOrThrow.mockResolvedValue({
        id: 'order-1',
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

      await repository.reviveAndReserve('order-1', OrderStatus.PENDING, PaymentStatus.PAID);

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

    it('throws ConflictException and does not update the order when a position lacks stock', async () => {
      const tx = seedTx();
      // First line reserves fine, second line's stock is gone → whole tx throws.
      tx.product.updateMany.mockResolvedValueOnce({ count: 1 }).mockResolvedValueOnce({ count: 0 });

      await expect(
        repository.reviveAndReserve('order-1', OrderStatus.PENDING, PaymentStatus.PAID),
      ).rejects.toThrow(ConflictException);
      expect(tx.order.update).not.toHaveBeenCalled();
      // Nothing committed → nothing to evict.
      expect(cacheMock.delByPrefix).not.toHaveBeenCalled();
    });

    it('evicts list pages and per-product detail caches after commit', async () => {
      const tx = seedTx();
      tx.product.updateMany.mockResolvedValue({ count: 1 });

      await repository.reviveAndReserve('order-1', OrderStatus.PENDING, PaymentStatus.PAID);

      expect(cacheMock.delByPrefix).toHaveBeenCalledWith(PRODUCT_LIST_PREFIX);
      expect(cacheMock.del).toHaveBeenCalledWith(productDetailSlugKey('iphone-15-pro-case'));
      expect(cacheMock.del).toHaveBeenCalledWith(productDetailIdKey('product-uuid-1'));
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
        items: [{ productId: 'product-uuid-1', quantity: 2 }],
      });
      tx.order.update.mockResolvedValue({
        id: 'order-1',
        status: OrderStatus.CANCELLED,
        items: [{ productId: 'product-uuid-1', product: { slug: 'iphone-15-pro-case' } }],
      });
      prismaMock.$transaction.mockImplementation(async (cb: (t: typeof tx) => unknown) => cb(tx));

      await repository.cancelAndRestock('order-1');

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
