import { ConflictException } from '@nestjs/common';
import { OrderStatus } from '@prisma/client';
import { OrderRepository } from './order.repository';
import { PrismaService } from '../prisma';
import type { CreateOrderParams } from './order.types';
import type { CartWithItems } from '../cart/cart.repository';

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
  productVariant: {
    updateMany: jest.fn(),
    update: jest.fn(),
  },
});

const prismaMock = {
  $transaction: jest.fn(),
};

// ─── Test data ──────────────────────────────────────────────────────────────

const variantItem: CartWithItems['items'][number] = {
  id: 'cart-item-1',
  productId: 'product-uuid-1',
  variantId: 'variant-uuid-1',
  quantity: 2,
  createdAt: new Date(),
  updatedAt: new Date(),
  product: {
    id: 'product-uuid-1',
    name: 'iPhone 15 Pro Case',
    price: { toString: () => '29.99' } as never,
    compareAtPrice: null,
    isActive: true,
  },
  variant: {
    id: 'variant-uuid-1',
    name: 'Black / iPhone 15 Pro',
    price: { toString: () => '29.99' } as never,
    stock: 50,
    isActive: true,
  },
};

const noVariantItem: CartWithItems['items'][number] = {
  id: 'cart-item-2',
  productId: 'product-uuid-2',
  variantId: null,
  quantity: 1,
  createdAt: new Date(),
  updatedAt: new Date(),
  product: {
    id: 'product-uuid-2',
    name: 'Screen Protector',
    price: { toString: () => '9.99' } as never,
    compareAtPrice: null,
    isActive: true,
  },
  variant: null,
};

const baseParams: CreateOrderParams = {
  userId: 'user-uuid-1',
  cartId: 'cart-uuid-1',
  cartItems: [variantItem, noVariantItem],
  shippingAddress: {
    firstName: 'Olena',
    lastName: 'Shevchenko',
    address1: 'vul. Khreshchatyk 1',
    city: 'Kyiv',
    postalCode: '01001',
    country: 'UA',
  },
};

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('OrderRepository', () => {
  let repository: OrderRepository;

  beforeEach(() => {
    jest.clearAllMocks();
    repository = new OrderRepository(prismaMock as unknown as PrismaService);
  });

  // ─── createFromCart — stock decrement guard (CRITICAL / TASK-053) ──────────

  describe('createFromCart — stock decrement', () => {
    it('decrements stock with a conditional WHERE stock >= quantity for variant lines', async () => {
      const tx = makeTx();
      tx.order.create.mockResolvedValue({ id: 'order-1', items: [] });
      tx.productVariant.updateMany.mockResolvedValue({ count: 1 });
      prismaMock.$transaction.mockImplementation(async (cb: (t: typeof tx) => unknown) => cb(tx));

      await repository.createFromCart(baseParams);

      // Only the variant line is decremented; the no-variant line is skipped.
      expect(tx.productVariant.updateMany).toHaveBeenCalledTimes(1);
      expect(tx.productVariant.updateMany).toHaveBeenCalledWith({
        where: { id: 'variant-uuid-1', stock: { gte: 2 } },
        data: { stock: { decrement: 2 } },
      });
    });

    it('throws ConflictException and aborts when no stock row is affected (oversell guard)', async () => {
      const tx = makeTx();
      tx.order.create.mockResolvedValue({ id: 'order-1', items: [] });
      // Stock was consumed by a racing order: the conditional update affects 0 rows.
      tx.productVariant.updateMany.mockResolvedValue({ count: 0 });
      prismaMock.$transaction.mockImplementation(async (cb: (t: typeof tx) => unknown) => cb(tx));

      await expect(repository.createFromCart(baseParams)).rejects.toThrow(ConflictException);
    });
  });

  // ─── cancelAndRestock — release reserved stock (WARNING / TASK-054) ────────

  describe('cancelAndRestock', () => {
    it('increments stock for variant lines and sets the order to CANCELLED', async () => {
      const tx = makeTx();
      tx.order.findUniqueOrThrow.mockResolvedValue({
        id: 'order-1',
        items: [
          { variantId: 'variant-uuid-1', quantity: 2 },
          { variantId: null, quantity: 1 },
        ],
      });
      tx.order.update.mockResolvedValue({
        id: 'order-1',
        status: OrderStatus.CANCELLED,
        items: [],
      });
      prismaMock.$transaction.mockImplementation(async (cb: (t: typeof tx) => unknown) => cb(tx));

      await repository.cancelAndRestock('order-1');

      // Variant line is restocked; the no-variant line is skipped.
      expect(tx.productVariant.update).toHaveBeenCalledTimes(1);
      expect(tx.productVariant.update).toHaveBeenCalledWith({
        where: { id: 'variant-uuid-1' },
        data: { stock: { increment: 2 } },
      });
      expect(tx.order.update).toHaveBeenCalledWith({
        where: { id: 'order-1' },
        data: { status: OrderStatus.CANCELLED },
        include: expect.any(Object),
      });
    });
  });
});
