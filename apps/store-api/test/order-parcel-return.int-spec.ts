import { ConfigModule } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import {
  OrderHistoryChangeType,
  OrderHistoryNote,
  OrderStatus,
  PaymentStatus,
  ReturnStatus,
} from '@prisma/client';
import { randomUUID } from 'crypto';
import { OrderRepository } from '../src/order/order.repository';
import { OrderMoneyRepository } from '../src/order/order-money.repository';
import { ParcelReturnRefusedError } from '../src/order/order.errors';
import { CacheService } from '../src/cache';
import { PrismaService } from '../src/prisma';
import { ProductIndexer } from '../src/search/product-indexer';

/**
 * «Посилку повернуто на склад» (TASK-2575) — the REAL repository against a REAL
 * Postgres, because "credits the stock exactly once" is a property of two
 * transactions meeting at the order-row lock, which a mocked test cannot see.
 *
 * The defect: a cancel after shipment (a refused parcel) never returned stock —
 * only pre-shipment cancels restock — and a CANCELLED order cannot open a return,
 * so the units the order decremented were lost to inventory for good.
 *
 * Requires an isolated `*_test` database (setup-int.ts forces DATABASE_URL).
 */
describe('OrderRepository.returnParcelToStock (integration, TASK-2575)', () => {
  let prisma: PrismaService;
  let repo: OrderRepository;

  let userId: string;
  let categoryId: string;
  let productId: string;

  const INITIAL_STOCK = 10;
  const ORDERED_QTY = 3;

  beforeAll(async () => {
    const url = process.env.DATABASE_URL ?? '';
    if (!/test/i.test(url)) {
      throw new Error(`Refusing to run integration tests against a non-test database: "${url}"`);
    }

    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true })],
      providers: [
        PrismaService,
        OrderRepository,
        OrderMoneyRepository,
        { provide: CacheService, useValue: { del: jest.fn(), delByPrefix: jest.fn() } },
        {
          provide: ProductIndexer,
          useValue: {
            index: jest.fn().mockResolvedValue(undefined),
            remove: jest.fn().mockResolvedValue(undefined),
          } satisfies ProductIndexer,
        },
      ],
    }).compile();

    prisma = moduleRef.get(PrismaService);
    repo = moduleRef.get(OrderRepository);
    await prisma.$connect();
  });

  afterAll(async () => {
    await prisma?.$disconnect();
  });

  beforeEach(async () => {
    const suffix = randomUUID().slice(0, 8);
    const category = await prisma.category.create({
      data: { name: `cat-${suffix}`, slug: `cat-${suffix}` },
    });
    categoryId = category.id;
    const product = await prisma.product.create({
      data: {
        name: `prod-${suffix}`,
        slug: `prod-${suffix}`,
        price: 100,
        stock: INITIAL_STOCK,
        categoryId,
      },
    });
    productId = product.id;
    const user = await prisma.user.create({
      data: { email: `parcel-${suffix}@test.local`, passwordHash: 'x' },
    });
    userId = user.id;
  });

  afterEach(async () => {
    if (!prisma) return;
    if (userId) {
      await prisma.return.deleteMany({ where: { order: { userId } } });
      await prisma.orderMoneyEntry.deleteMany({ where: { order: { userId } } });
      await prisma.orderStatusHistory.deleteMany({ where: { order: { userId } } });
      await prisma.orderItem.deleteMany({ where: { order: { userId } } });
      await prisma.order.deleteMany({ where: { userId } });
    }
    if (productId) await prisma.product.deleteMany({ where: { id: productId } });
    if (categoryId) await prisma.category.deleteMany({ where: { id: categoryId } });
    if (userId) await prisma.user.deleteMany({ where: { id: userId } });
    userId = productId = categoryId = '';
  });

  /**
   * An order placed (stock decremented), moved through `path`, and cancelled from
   * its last status — the history rows the admin status change writes.
   */
  async function cancelledOrder(path: OrderStatus[]): Promise<string> {
    const order = await prisma.order.create({
      data: {
        userId,
        status: OrderStatus.CANCELLED,
        paymentStatus: PaymentStatus.PENDING,
        subtotal: 300,
        total: 300,
        shippingCost: 0,
        shippingAddress: { city: 'Київ', warehouse: '1' },
        items: { create: [{ productId, quantity: ORDERED_QTY, price: 100 }] },
      },
    });
    await prisma.product.update({
      where: { id: productId },
      data: { stock: { decrement: ORDERED_QTY } },
    });

    const statuses = [OrderStatus.PENDING, ...path, OrderStatus.CANCELLED];
    const base = Date.now() - 60_000;
    for (let i = 1; i < statuses.length; i++) {
      await prisma.orderStatusHistory.create({
        data: {
          orderId: order.id,
          changeType: OrderHistoryChangeType.STATUS,
          fromStatus: statuses[i - 1],
          toStatus: statuses[i],
          changedAt: new Date(base + i * 1000),
        },
      });
    }
    return order.id;
  }

  const stockNow = async () =>
    (await prisma.product.findUniqueOrThrow({ where: { id: productId } })).stock;

  const parcelRows = (orderId: string) =>
    prisma.orderStatusHistory.findMany({
      where: { orderId, note: OrderHistoryNote.PARCEL_RETURNED_TO_STOCK },
    });

  const refusalOf = async (promise: Promise<unknown>) => {
    const error = await promise.then(
      () => null,
      (e: unknown) => e,
    );
    expect(error).toBeInstanceOf(ParcelReturnRefusedError);
    return (error as ParcelReturnRefusedError).reason;
  };

  it('credits every line back once and writes the history row', async () => {
    const orderId = await cancelledOrder([OrderStatus.CONFIRMED, OrderStatus.SHIPPED]);
    expect(await stockNow()).toBe(INITIAL_STOCK - ORDERED_QTY);

    const order = await repo.returnParcelToStock(orderId, userId);

    expect(order.status).toBe(OrderStatus.CANCELLED);
    expect(order.restockedAt).not.toBeNull();
    expect(await stockNow()).toBe(INITIAL_STOCK);
    const rows = await parcelRows(orderId);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      changeType: OrderHistoryChangeType.STATUS,
      fromStatus: OrderStatus.CANCELLED,
      toStatus: OrderStatus.CANCELLED,
      changedBy: userId,
    });
  });

  it('refuses a second call after the first committed, and leaves the stock alone', async () => {
    const orderId = await cancelledOrder([OrderStatus.SHIPPED, OrderStatus.DELIVERED]);
    await repo.returnParcelToStock(orderId, userId);

    expect(await refusalOf(repo.returnParcelToStock(orderId, userId))).toBe('ALREADY_RETURNED');

    expect(await stockNow()).toBe(INITIAL_STOCK);
    expect(await parcelRows(orderId)).toHaveLength(1);
  });

  it('credits the stock only ONCE when two calls race', async () => {
    const orderId = await cancelledOrder([OrderStatus.SHIPPED]);

    const results = await Promise.allSettled([
      repo.returnParcelToStock(orderId, userId),
      repo.returnParcelToStock(orderId, userId),
    ]);

    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    const rejected = results.filter((r): r is PromiseRejectedResult => r.status === 'rejected');
    expect(rejected).toHaveLength(1);
    expect(rejected[0].reason).toBeInstanceOf(ParcelReturnRefusedError);
    expect(await stockNow()).toBe(INITIAL_STOCK);
    expect(await parcelRows(orderId)).toHaveLength(1);
  });

  it('refuses an order cancelled before shipment', async () => {
    const orderId = await cancelledOrder([OrderStatus.CONFIRMED, OrderStatus.PROCESSING]);

    expect(await refusalOf(repo.returnParcelToStock(orderId, userId))).toBe(
      'NOT_CANCELLED_AFTER_SHIPMENT',
    );
    expect(await stockNow()).toBe(INITIAL_STOCK - ORDERED_QTY);
    expect(await parcelRows(orderId)).toHaveLength(0);
  });

  it('refuses while a return that is not REJECTED exists — it may credit the same units', async () => {
    const orderId = await cancelledOrder([OrderStatus.SHIPPED, OrderStatus.DELIVERED]);
    await prisma.return.create({ data: { orderId, status: ReturnStatus.REQUESTED } });

    expect(await refusalOf(repo.returnParcelToStock(orderId, userId))).toBe('HAS_RETURN');
    expect(await stockNow()).toBe(INITIAL_STOCK - ORDERED_QTY);
  });

  it('allows it when the only return was REJECTED', async () => {
    const orderId = await cancelledOrder([OrderStatus.SHIPPED, OrderStatus.DELIVERED]);
    await prisma.return.create({ data: { orderId, status: ReturnStatus.REJECTED } });

    await repo.returnParcelToStock(orderId, userId);

    expect(await stockNow()).toBe(INITIAL_STOCK);
  });

  it('answers a missing order with its own refusal', async () => {
    await expect(repo.returnParcelToStock(randomUUID(), userId)).rejects.toBeInstanceOf(
      ParcelReturnRefusedError,
    );
  });
});
