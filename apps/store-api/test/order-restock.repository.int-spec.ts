import { ConflictException } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { OrderStatus, PaymentAttemptStatus, PaymentStatus } from '@prisma/client';
import { randomUUID } from 'crypto';
import { OrderRepository } from '../src/order/order.repository';
import { CacheService } from '../src/cache';
import { PrismaService } from '../src/prisma';
import { ProductIndexer } from '../src/search/product-indexer';

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
        // TASK-616: the repository re-indexes restocked products (best-effort,
        // after commit). Search is not under test — a resolving mock of every
        // ProductIndexer method is enough for Nest to build OrderRepository.
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
    // If beforeAll failed, `prisma` was never assigned — do not mask the real
    // error with a second TypeError here.
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
      data: { email: `restock-${suffix}@test.local`, passwordHash: 'x' },
    });
    userId = user.id;
  });

  afterEach(async () => {
    // TASK-616: robust teardown. Skip when the module never compiled, scope
    // every delete to THIS test's rows (the old `deleteMany({})` wiped other
    // suites' history/items on the shared store_test), and never pass an unset
    // id — Prisma drops `{ id: undefined }` and would delete every row.
    if (!prisma) return;
    if (userId) {
      await prisma.payment.deleteMany({ where: { order: { userId } } });
      await prisma.orderStatusHistory.deleteMany({ where: { order: { userId } } });
      await prisma.orderItem.deleteMany({ where: { order: { userId } } });
      await prisma.order.deleteMany({ where: { userId } });
    }
    if (productId) await prisma.product.deleteMany({ where: { id: productId } });
    if (categoryId) await prisma.category.deleteMany({ where: { id: categoryId } });
    if (userId) await prisma.user.deleteMany({ where: { id: userId } });
    userId = productId = categoryId = '';
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

  // ─── applyPaymentOutcome vs a TTL cancel (TASK-619 under a race) ───────────
  // OrderService plans a `success` from an unlocked read. If the reservation
  // worker's cancel commits between that read and this write, the cancel must
  // win: the order stays CANCELLED with its stock returned, and nothing of the
  // payment plan lands — the provider's retry is re-planned on the fresh row,
  // where it becomes PAID_AFTER_CANCEL.

  async function openAttempt(orderId: string): Promise<string> {
    const payment = await prisma.payment.create({
      data: { orderId, provider: 'liqpay', amount: 300 },
    });
    return payment.id;
  }

  /** What OrderService plans for a `success` on an order it read as PENDING. */
  const successPlanFor = (orderId: string, paymentId: string) => ({
    paymentId,
    orderId,
    expected: { status: OrderStatus.PENDING, paymentStatus: PaymentStatus.PENDING },
    attemptStatus: PaymentAttemptStatus.SUCCEEDED,
    settledAt: new Date(),
    paymentStatusChange: { from: PaymentStatus.PENDING, to: PaymentStatus.PAID },
    paidAt: new Date(),
    clearReservation: true,
    statusChange: { from: OrderStatus.PENDING, to: OrderStatus.CONFIRMED },
  });

  it('does not overwrite a cancel that committed after the payment plan was decided', async () => {
    const orderId = await placeOrder();
    const paymentId = await openAttempt(orderId);
    const plan = successPlanFor(orderId, paymentId);

    await repo.cancelAndRestock(orderId, userId);

    await expect(repo.applyPaymentOutcome(plan)).rejects.toBeInstanceOf(ConflictException);

    const order = await prisma.order.findUniqueOrThrow({ where: { id: orderId } });
    expect(order.status).toBe(OrderStatus.CANCELLED);
    expect(order.paymentStatus).toBe(PaymentStatus.PENDING);
    expect(order.restockedAt).not.toBeNull();
    expect(await stockNow()).toBe(INITIAL_STOCK);
    // Rolled back as a whole: the attempt row is not settled either.
    const payment = await prisma.payment.findUniqueOrThrow({ where: { id: paymentId } });
    expect(payment.status).toBe(PaymentAttemptStatus.PENDING);
  });

  it('applies the payment plan when nothing moved in between', async () => {
    const orderId = await placeOrder();
    const paymentId = await openAttempt(orderId);

    await repo.applyPaymentOutcome(successPlanFor(orderId, paymentId));

    const order = await prisma.order.findUniqueOrThrow({ where: { id: orderId } });
    expect(order.status).toBe(OrderStatus.CONFIRMED);
    expect(order.paymentStatus).toBe(PaymentStatus.PAID);
    expect(await stockNow()).toBe(INITIAL_STOCK - ORDERED_QTY);
  });
});
