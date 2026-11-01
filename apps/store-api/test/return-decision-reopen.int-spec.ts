import { HttpException } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { OrderStatus, PaymentStatus, ReturnDecision, ReturnStatus, UserRole } from '@prisma/client';
import { PinoLogger } from 'nestjs-pino';
import { randomUUID } from 'crypto';
import { OrderRepository } from '../src/order/order.repository';
import { OrderMoneyRepository } from '../src/order/order-money.repository';
import { ReturnRepository } from '../src/order/returns/return.repository';
import { ReturnService } from '../src/order/returns/return.service';
import { ShopNotifier } from '../src/notification/shop-notifier.service';
import { CacheService } from '../src/cache';
import { PrismaService } from '../src/prisma';
import { ProductIndexer } from '../src/search/product-indexer';

/**
 * Re-opening a refused return under concurrency (TASK-1961, TASK-2044) — the
 * REAL service and repositories against a REAL Postgres, for the same reason as
 * `return-quantity-cap.int-spec.ts`: the race lives between two transactions,
 * and a mocked test lets both sides "win" by construction.
 *
 * A REJECTED return releases its units (TASK-784), so the customer may file a
 * new request for them. Since B-12 an operator may also CHANGE the refusal into
 * a refund/replacement/repair, which claims the units back. Both doors take the
 * same `SELECT … FOR UPDATE` on the order row and re-count the live claims under
 * it; on the last unit exactly one of them may succeed.
 *
 * Requires an isolated `*_test` database (setup-int.ts forces DATABASE_URL).
 */
describe('ReturnService.decideReturn — re-opening a refusal under concurrency (integration)', () => {
  let prisma: PrismaService;
  let service: ReturnService;

  let userId: string;
  let operatorId: string;
  let categoryId: string;
  let productId: string;
  let orderId: string;
  let orderItemId: string;
  let rejectedReturnId: string;

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
        ReturnRepository,
        ReturnService,
        {
          provide: ShopNotifier,
          useValue: { enqueueReturnRequested: jest.fn().mockResolvedValue(0) },
        },
        { provide: CacheService, useValue: { del: jest.fn(), delByPrefix: jest.fn() } },
        {
          provide: ProductIndexer,
          useValue: {
            index: jest.fn().mockResolvedValue(undefined),
            remove: jest.fn().mockResolvedValue(undefined),
          } satisfies ProductIndexer,
        },
        {
          provide: PinoLogger,
          useValue: { setContext: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() },
        },
      ],
    }).compile();

    prisma = moduleRef.get(PrismaService);
    service = moduleRef.get(ReturnService);
    await prisma.$connect();
  });

  afterAll(async () => {
    await prisma?.$disconnect();
  });

  /** A delivered order for ONE unit, and a refused return that once claimed it. */
  beforeEach(async () => {
    const suffix = randomUUID().slice(0, 8);

    const category = await prisma.category.create({
      data: { name: `cat-${suffix}`, slug: `cat-${suffix}` },
    });
    categoryId = category.id;

    const product = await prisma.product.create({
      data: { name: `prod-${suffix}`, slug: `prod-${suffix}`, price: 100, stock: 5, categoryId },
    });
    productId = product.id;

    const user = await prisma.user.create({
      data: { email: `return-reopen-${suffix}@test.local`, passwordHash: 'x' },
    });
    userId = user.id;

    const operator = await prisma.user.create({
      data: {
        email: `return-reopen-op-${suffix}@test.local`,
        passwordHash: 'x',
        role: UserRole.MANAGER,
      },
    });
    operatorId = operator.id;

    const order = await prisma.order.create({
      data: {
        userId,
        status: OrderStatus.DELIVERED,
        paymentStatus: PaymentStatus.PAID,
        subtotal: 100,
        total: 100,
        shippingCost: 0,
        shippingAddress: { city: 'Київ', warehouse: '1' },
        items: { create: [{ productId, quantity: 1, price: 100 }] },
      },
      include: { items: true },
    });
    orderId = order.id;
    orderItemId = order.items[0].id;

    const rejected = await prisma.return.create({
      data: {
        orderId,
        createdByUserId: userId,
        status: ReturnStatus.REJECTED,
        decision: ReturnDecision.REJECT,
        decisionReason: 'Немає чека',
        decidedById: operatorId,
        decidedAt: new Date(),
        resolvedAt: new Date(),
        items: { create: [{ orderItemId, quantity: 1 }] },
      },
    });
    rejectedReturnId = rejected.id;
  });

  afterEach(async () => {
    // Scoped to THIS test's rows, and never with an unset id — Prisma drops
    // `{ id: undefined }` and would delete every row on the shared store_test.
    if (!prisma) return;
    if (orderId) {
      // Decision events cascade with their return.
      await prisma.return.deleteMany({ where: { orderId } });
    }
    if (userId) {
      await prisma.orderStatusHistory.deleteMany({ where: { order: { userId } } });
      await prisma.orderItem.deleteMany({ where: { order: { userId } } });
      await prisma.order.deleteMany({ where: { userId } });
    }
    if (productId) await prisma.product.deleteMany({ where: { id: productId } });
    if (categoryId) await prisma.category.deleteMany({ where: { id: categoryId } });
    if (userId) await prisma.user.deleteMany({ where: { id: userId } });
    if (operatorId) await prisma.user.deleteMany({ where: { id: operatorId } });
    userId = operatorId = productId = categoryId = orderId = orderItemId = rejectedReturnId = '';
  });

  const reopen = () =>
    service.decideReturn(rejectedReturnId, operatorId, {
      decision: ReturnDecision.REFUND,
      reason: 'Чек знайшовся',
    });

  const requestLastUnit = () =>
    service.createReturn(userId, orderId, { items: [{ orderItemId, quantity: 1 }] });

  /** Units held by returns that still claim them — everything but REJECTED. */
  const liveClaimedUnits = async () =>
    (
      await prisma.returnItem.aggregate({
        where: { orderItemId, return: { orderId, status: { not: ReturnStatus.REJECTED } } },
        _sum: { quantity: true },
      })
    )._sum.quantity ?? 0;

  it('lets exactly one of "re-open the refusal" and "a new request" claim the last unit', async () => {
    const results = await Promise.allSettled([reopen(), requestLastUnit()]);

    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    const rejected = results.filter((r): r is PromiseRejectedResult => r.status === 'rejected');

    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect(rejected[0].reason).toBeInstanceOf(HttpException);
    expect((rejected[0].reason as HttpException).getResponse()).toMatchObject({
      error: 'RETURN_QUANTITY_EXCEEDED',
    });
    expect(await liveClaimedUnits()).toBe(1);
  });

  it('refuses to re-open once a newer request holds the unit — 409, nothing written', async () => {
    await requestLastUnit();

    const caught = await reopen().catch((error: unknown) => error);

    expect(caught).toBeInstanceOf(HttpException);
    expect((caught as HttpException).getStatus()).toBe(409);
    expect((caught as HttpException).getResponse()).toMatchObject({
      error: 'RETURN_QUANTITY_EXCEEDED',
    });
    const row = await prisma.return.findUniqueOrThrow({ where: { id: rejectedReturnId } });
    expect(row.status).toBe(ReturnStatus.REJECTED);
    expect(row.decision).toBe(ReturnDecision.REJECT);
    expect(await prisma.returnDecisionEvent.count({ where: { returnId: rejectedReturnId } })).toBe(
      0,
    );
  });

  it('re-opens when the unit is free, recording the decision and its event in the database', async () => {
    await reopen();

    const row = await prisma.return.findUniqueOrThrow({ where: { id: rejectedReturnId } });
    expect(row).toMatchObject({
      status: ReturnStatus.APPROVED,
      decision: ReturnDecision.REFUND,
      decisionReason: 'Чек знайшовся',
      decidedById: operatorId,
      decisionLegacy: false,
    });
    const events = await prisma.returnDecisionEvent.findMany({
      where: { returnId: rejectedReturnId },
    });
    expect(events).toEqual([
      expect.objectContaining({
        decision: ReturnDecision.REFUND,
        reason: 'Чек знайшовся',
        actorId: operatorId,
        legacy: false,
      }),
    ]);
    // …and the new request for the same unit is now the one refused.
    await expect(requestLastUnit()).rejects.toBeInstanceOf(HttpException);
    expect(await liveClaimedUnits()).toBe(1);
  });
});
