import { ConflictException } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { OrderStatus, PaymentStatus } from '@prisma/client';
import { randomUUID } from 'crypto';
import { OrderRepository } from '../src/order/order.repository';
import { CacheService } from '../src/cache';
import { PrismaService } from '../src/prisma';

/**
 * Integration tests for the cancel/restock concurrency guard (TASK-315) — the
 * REAL repository against a REAL Postgres, because this is a bug that only
 * exists between two simultaneous transactions and therefore cannot be caught by
 * a mocked unit test. Mocks would happily let both cancellations "succeed".
 *
 * The bug: OrderService.cancelOrder read `status === PENDING` OUTSIDE the
 * transaction and then called cancelAndRestock, which incremented stock
 * unconditionally. Two concurrent cancels of the same order — a double click, a
 * client retry on a flaky connection, two open tabs — both passed the check and
 * both credited the stock back. One decrement, two increments: inventory that
 * does not physically exist, which is then sold to a customer who will never
 * receive it.
 *
 * Requires an isolated `*_test` database (setup-int.ts forces DATABASE_URL).
 */
describe('OrderRepository.cancelAndRestock — concurrency (integration)', () => {
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
        // The repository only evicts caches after the transaction commits; the
        // concurrency guarantee under test does not involve Redis.
        { provide: CacheService, useValue: { del: jest.fn(), delByPrefix: jest.fn() } },
      ],
    }).compile();

    prisma = moduleRef.get(PrismaService);
    repo = moduleRef.get(OrderRepository);
    await prisma.$connect();
  });

  afterAll(async () => {
    await prisma.$disconnect();
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
      data: { email: `restock-${suffix}@test.local`, passwordHash: 'x' },
    });
    userId = user.id;
  });

  afterEach(async () => {
    await prisma.orderStatusHistory.deleteMany({});
    await prisma.orderItem.deleteMany({});
    await prisma.order.deleteMany({ where: { userId } });
    await prisma.product.deleteMany({ where: { id: productId } });
    await prisma.category.deleteMany({ where: { id: categoryId } });
    await prisma.user.deleteMany({ where: { id: userId } });
  });

  /** A PENDING order holding a reservation, exactly as createFromCart leaves it. */
  async function placeOrder(): Promise<string> {
    const order = await prisma.order.create({
      data: {
        userId,
        status: OrderStatus.PENDING,
        paymentStatus: PaymentStatus.PENDING,
        subtotal: 300,
        total: 300,
        shippingCost: 0,
        shippingAddress: { city: 'Київ', warehouse: '1' },
        items: {
          create: [{ productId, quantity: ORDERED_QTY, price: 100 }],
        },
      },
    });

    // Mirror the reservation createFromCart makes when the order is placed.
    await prisma.product.update({
      where: { id: productId },
      data: { stock: { decrement: ORDERED_QTY } },
    });

    return order.id;
  }

  const stockNow = async () =>
    (await prisma.product.findUniqueOrThrow({ where: { id: productId } })).stock;

  it('returns the reserved stock exactly once on a single cancel', async () => {
    const orderId = await placeOrder();
    expect(await stockNow()).toBe(INITIAL_STOCK - ORDERED_QTY);

    await repo.cancelAndRestock(orderId, userId);

    expect(await stockNow()).toBe(INITIAL_STOCK);
    const order = await prisma.order.findUniqueOrThrow({ where: { id: orderId } });
    expect(order.status).toBe(OrderStatus.CANCELLED);
    expect(order.restockedAt).not.toBeNull();
  });

  // THE REGRESSION TEST. Both cancels are fired without awaiting the first, so
  // they genuinely race inside Postgres.
  it('credits the stock only ONCE when two cancels race', async () => {
    const orderId = await placeOrder();

    const results = await Promise.allSettled([
      repo.cancelAndRestock(orderId, userId),
      repo.cancelAndRestock(orderId, userId),
    ]);

    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    const rejected = results.filter((r) => r.status === 'rejected');

    // Exactly one wins; the loser is rejected rather than silently double-crediting.
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);

    // The whole point: stock is back to where it started, NOT above it.
    expect(await stockNow()).toBe(INITIAL_STOCK);
  });

  it('refuses a second cancel after the first has committed', async () => {
    const orderId = await placeOrder();
    await repo.cancelAndRestock(orderId, userId);

    await expect(repo.cancelAndRestock(orderId, userId)).rejects.toBeInstanceOf(ConflictException);

    expect(await stockNow()).toBe(INITIAL_STOCK);
  });

  it('does not write a second history row for the losing cancel', async () => {
    const orderId = await placeOrder();

    await Promise.allSettled([
      repo.cancelAndRestock(orderId, userId),
      repo.cancelAndRestock(orderId, userId),
    ]);

    const history = await prisma.orderStatusHistory.findMany({ where: { orderId } });
    expect(history).toHaveLength(1);
  });
});
