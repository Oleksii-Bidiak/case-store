import { ConflictException } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { OrderStatus, PaymentAttemptStatus, PaymentStatus } from '@prisma/client';
import { randomUUID } from 'crypto';
import { OrderRepository } from '../src/order/order.repository';
import type { PaymentApplyPlan } from '../src/order/order.types';
import { CacheService } from '../src/cache';
import { PrismaService } from '../src/prisma';
import { ProductIndexer } from '../src/search/product-indexer';

/**
 * ORDER_RESERVATION_EXPIRY=release against a REAL Postgres (TASK-627).
 *
 * In `release` mode the TTL worker gives an unpaid order's stock back and leaves
 * the order PENDING, and a later payment takes the stock again. That puts two
 * writers on the same units — the release and the payment — and neither changes
 * the order's status, so the "the status I read is still the status" guard that
 * protects the cancel path (TASK-619) sees nothing. A mocked unit test cannot
 * show whether the stock is then counted twice or lost; only two transactions in
 * a real database can. The invariant checked everywhere below:
 *
 *   stock = INITIAL − (the order holds its units ? ORDERED : 0)
 *
 * where "holds its units" is `restockedAt IS NULL` on a live order.
 *
 * Requires an isolated `*_test` database (setup-int.ts forces DATABASE_URL).
 */
describe('ORDER_RESERVATION_EXPIRY=release — stock under concurrent writes (integration)', () => {
  let prisma: PrismaService;
  let repo: OrderRepository;

  let userId = '';
  let categoryId = '';
  let productId = '';

  const INITIAL_STOCK = 10;
  const ORDERED_QTY = 3;
  /** The worker judged the deadline overdue at this moment. */
  const past = () => new Date(Date.now() - 60_000);
  const NOW = () => new Date();

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
      data: { name: `rel-cat-${suffix}`, slug: `rel-cat-${suffix}` },
    });
    categoryId = category.id;
    const product = await prisma.product.create({
      data: {
        name: `rel-prod-${suffix}`,
        slug: `rel-prod-${suffix}`,
        price: 100,
        stock: INITIAL_STOCK,
        categoryId,
      },
    });
    productId = product.id;
    const user = await prisma.user.create({
      data: { email: `release-${suffix}@test.local`, passwordHash: 'x' },
    });
    userId = user.id;
  });

  afterEach(async () => {
    // Scoped to THIS test's rows — never an unset id (Prisma drops `undefined`).
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

  /** A PENDING card order whose deadline has passed, holding its units. */
  async function placeOverdueOrder(): Promise<string> {
    const order = await prisma.order.create({
      data: {
        userId,
        status: OrderStatus.PENDING,
        paymentStatus: PaymentStatus.PENDING,
        paymentMethod: 'ONLINE',
        reservationExpiresAt: new Date(Date.now() - 5 * 60_000),
        subtotal: 300,
        total: 300,
        shippingCost: 0,
        shippingAddress: { city: 'Київ', warehouse: '1' },
        items: { create: [{ productId, quantity: ORDERED_QTY, price: 100 }] },
      },
    });
    // Mirror the reservation createFromCart makes.
    await prisma.product.update({
      where: { id: productId },
      data: { stock: { decrement: ORDERED_QTY } },
    });
    return order.id;
  }

  async function openAttempt(orderId: string): Promise<string> {
    const payment = await prisma.payment.create({
      data: { orderId, provider: 'liqpay', amount: 300 },
    });
    return payment.id;
  }

  /** What OrderService plans for a `success` on a PENDING order (TASK-627 hold). */
  const successPlan = (
    orderId: string,
    paymentId: string,
    stockHold: 'held' | 'released',
  ): PaymentApplyPlan => ({
    paymentId,
    orderId,
    expected: { status: OrderStatus.PENDING, paymentStatus: PaymentStatus.PENDING },
    attemptStatus: PaymentAttemptStatus.SUCCEEDED,
    settledAt: NOW(),
    failureCode: null,
    failureMessage: null,
    paymentStatusChange: { from: PaymentStatus.PENDING, to: PaymentStatus.PAID },
    paidAt: NOW(),
    clearReservation: true,
    stockHold,
    statusChange: { from: OrderStatus.PENDING, to: OrderStatus.CONFIRMED },
  });

  const stockNow = async () =>
    (await prisma.product.findUniqueOrThrow({ where: { id: productId } })).stock;
  const orderNow = (orderId: string) => prisma.order.findUniqueOrThrow({ where: { id: orderId } });

  /** The invariant, stated once. */
  async function expectStockMatchesHold(orderId: string): Promise<void> {
    const order = await orderNow(orderId);
    const holds = order.restockedAt === null && order.status !== OrderStatus.CANCELLED;
    expect(await stockNow()).toBe(INITIAL_STOCK - (holds ? ORDERED_QTY : 0));
  }

  // ─── The release itself ─────────────────────────────────────────────────────

  it('gives the units back once and leaves the order PENDING, unpaid and payable', async () => {
    const orderId = await placeOverdueOrder();
    const paymentId = await openAttempt(orderId);

    await expect(repo.releaseReservation(orderId, past())).resolves.toBe(true);

    expect(await stockNow()).toBe(INITIAL_STOCK);
    const order = await orderNow(orderId);
    expect(order.status).toBe(OrderStatus.PENDING);
    expect(order.paymentStatus).toBe(PaymentStatus.PENDING);
    expect(order.restockedAt).not.toBeNull();
    expect(order.reservationExpiresAt).toBeNull();
    // The attempt is left open — the customer may still pay.
    const attempt = await prisma.payment.findUniqueOrThrow({ where: { id: paymentId } });
    expect(attempt.status).toBe(PaymentAttemptStatus.PENDING);
    // No status changed, so no history row.
    expect(await prisma.orderStatusHistory.count({ where: { orderId } })).toBe(0);
  });

  it('credits the units only ONCE when two releases race', async () => {
    const orderId = await placeOverdueOrder();

    const results = await Promise.all([
      repo.releaseReservation(orderId, past()),
      repo.releaseReservation(orderId, past()),
    ]);

    expect(results.filter(Boolean)).toHaveLength(1);
    expect(await stockNow()).toBe(INITIAL_STOCK);
  });

  it('does not release an order whose deadline has not passed yet', async () => {
    const orderId = await placeOverdueOrder();
    await prisma.order.update({
      where: { id: orderId },
      data: { reservationExpiresAt: new Date(Date.now() + 30 * 60_000) },
    });

    await expect(repo.releaseReservation(orderId, NOW())).resolves.toBe(false);
    expect(await stockNow()).toBe(INITIAL_STOCK - ORDERED_QTY);
  });

  // ─── THE RACE: success × release ───────────────────────────────────────────

  // The interleaving that nothing before TASK-627 guarded: the payment plan was
  // read while the units were held, the release commits, THEN the payment writes.
  // Without the hold in the WHERE the order became PAID + CONFIRMED holding
  // nothing (units lost to it, sold to someone else).
  it('a release committed between the payment read and its write: the payment rolls back, stock is not lost', async () => {
    const orderId = await placeOverdueOrder();
    const paymentId = await openAttempt(orderId);
    const planReadWhileHeld = successPlan(orderId, paymentId, 'held');

    await repo.releaseReservation(orderId, past());

    await expect(repo.applyPaymentOutcome(planReadWhileHeld)).rejects.toBeInstanceOf(
      ConflictException,
    );
    // Nothing of the payment landed; the release stands exactly once.
    const afterConflict = await orderNow(orderId);
    expect(afterConflict.paymentStatus).toBe(PaymentStatus.PENDING);
    expect(afterConflict.restockedAt).not.toBeNull();
    expect(await stockNow()).toBe(INITIAL_STOCK);
    const attempt = await prisma.payment.findUniqueOrThrow({ where: { id: paymentId } });
    expect(attempt.status).toBe(PaymentAttemptStatus.PENDING);

    // The provider's retry / the reconcile poll re-plans against the fresh row.
    await repo.applyPaymentOutcome(successPlan(orderId, paymentId, 'released'));

    const paid = await orderNow(orderId);
    expect(paid.paymentStatus).toBe(PaymentStatus.PAID);
    expect(paid.status).toBe(OrderStatus.CONFIRMED);
    expect(paid.restockedAt).toBeNull();
    // Taken again exactly once — not twice, not zero times.
    expect(await stockNow()).toBe(INITIAL_STOCK - ORDERED_QTY);
  });

  it('a payment committed first: the release matches nothing and credits nothing', async () => {
    const orderId = await placeOverdueOrder();
    const paymentId = await openAttempt(orderId);

    await repo.applyPaymentOutcome(successPlan(orderId, paymentId, 'held'));
    await expect(repo.releaseReservation(orderId, past())).resolves.toBe(false);

    expect(await stockNow()).toBe(INITIAL_STOCK - ORDERED_QTY);
    expect((await orderNow(orderId)).restockedAt).toBeNull();
  });

  // Fired together, many times, so Postgres itself chooses the interleaving.
  it('success × release fired together: stock always equals what the order holds (20 rounds)', async () => {
    for (let round = 0; round < 20; round += 1) {
      await prisma.product.update({ where: { id: productId }, data: { stock: INITIAL_STOCK } });
      const orderId = await placeOverdueOrder();
      const paymentId = await openAttempt(orderId);

      const [paid] = await Promise.allSettled([
        repo.applyPaymentOutcome(successPlan(orderId, paymentId, 'held')),
        repo.releaseReservation(orderId, past()),
      ]);

      await expectStockMatchesHold(orderId);

      // A payment that lost the race is re-planned as `released`, as the service
      // would on the retry — and then the order holds its units again.
      if (paid.status === 'rejected') {
        expect(paid.reason).toBeInstanceOf(ConflictException);
        await repo.applyPaymentOutcome(successPlan(orderId, paymentId, 'released'));
      }

      const final = await orderNow(orderId);
      expect(final.paymentStatus).toBe(PaymentStatus.PAID);
      expect(final.restockedAt).toBeNull();
      expect(await stockNow()).toBe(INITIAL_STOCK - ORDERED_QTY);

      await prisma.payment.deleteMany({ where: { orderId } });
      await prisma.orderStatusHistory.deleteMany({ where: { orderId } });
      await prisma.orderItem.deleteMany({ where: { orderId } });
      await prisma.order.delete({ where: { id: orderId } });
    }
  });

  // ─── Late payment when the units are gone ──────────────────────────────────

  it('stock sold meanwhile: the payment is recorded, nothing is taken, the order keeps restockedAt', async () => {
    const orderId = await placeOverdueOrder();
    const paymentId = await openAttempt(orderId);
    await repo.releaseReservation(orderId, past());
    // Someone else buys all but one unit.
    await prisma.product.update({ where: { id: productId }, data: { stock: 1 } });

    await repo.applyPaymentOutcome(successPlan(orderId, paymentId, 'released'));

    const order = await orderNow(orderId);
    expect(order.paymentStatus).toBe(PaymentStatus.PAID);
    expect(order.restockedAt).not.toBeNull();
    // Nothing half-taken: the one remaining unit is still on the shelf.
    expect(await stockNow()).toBe(1);
  });

  // ─── Two paths re-taking one released hold ─────────────────────────────────

  it('late payment × operator revive fired together: the units are taken once', async () => {
    const orderId = await placeOverdueOrder();
    const paymentId = await openAttempt(orderId);
    await repo.releaseReservation(orderId, past());

    await Promise.allSettled([
      repo.applyPaymentOutcome(successPlan(orderId, paymentId, 'released')),
      repo.reviveAndReserve(orderId, OrderStatus.CONFIRMED, PaymentStatus.PENDING, userId),
    ]);

    expect((await orderNow(orderId)).restockedAt).toBeNull();
    expect(await stockNow()).toBe(INITIAL_STOCK - ORDERED_QTY);
  });

  // ─── Cancelling a released order ───────────────────────────────────────────

  it('the customer can cancel a released order, and nothing is credited twice', async () => {
    const orderId = await placeOverdueOrder();
    await repo.releaseReservation(orderId, past());

    await repo.cancelAndRestock(orderId, userId);

    const order = await orderNow(orderId);
    expect(order.status).toBe(OrderStatus.CANCELLED);
    expect(await stockNow()).toBe(INITIAL_STOCK);
  });

  it('cancel × release fired together: the units come back exactly once', async () => {
    const orderId = await placeOverdueOrder();

    await Promise.allSettled([
      repo.cancelAndRestock(orderId, userId),
      repo.releaseReservation(orderId, past()),
    ]);

    expect((await orderNow(orderId)).status).toBe(OrderStatus.CANCELLED);
    expect(await stockNow()).toBe(INITIAL_STOCK);
  });
});
