import { ConflictException, INestApplication } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { OrderStatus, PaymentStatus } from '@prisma/client';
import { randomUUID } from 'crypto';
import { CacheService } from '../src/cache';
import { OrderRepository } from '../src/order/order.repository';
import { ProductIndexer } from '../src/search/product-indexer';
import { DiscountRepository } from '../src/discount/discount.repository';
import { DiscountService } from '../src/discount/discount.service';
import { DiscountErrorCode } from '../src/discount/discount.errors';
import { PrismaService } from '../src/prisma';

/**
 * Integration tests for the discount REDEMPTION race (TOCTOU) — run the real
 * service + repository against a REAL Postgres so the concurrency guarantee is
 * proven by the database, not by a mock.
 *
 * `redeem` runs inside the order-creation transaction. Under Postgres's default
 * READ COMMITTED isolation a read-then-check-then-increment sequence lets two
 * transactions sitting at the cap both pass the check and both increment, so the
 * global `maxRedemptions` cap is overshot. The fix mirrors the stock decrement in
 * `order.repository.ts`: a conditional `UPDATE … WHERE redeemed_count <
 * max_redemptions`, whose predicate Postgres re-evaluates against the freshly
 * committed row version — the loser updates 0 rows and throws.
 *
 * That same UPDATE row-locks the discount until commit, which serializes
 * concurrent redemptions of one code and makes the subsequent `perUserLimit`
 * count race-free too (test 2).
 *
 * Requires an isolated `*_test` database (forced by setup-int.ts).
 * Run with `npm run test:int -w apps/store-api`.
 */
describe('DiscountService.redeem (integration — real Postgres concurrency)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let service: DiscountService;

  let userAId: string;
  let userBId: string;

  beforeAll(async () => {
    const url = process.env.DATABASE_URL ?? '';
    if (!/test/i.test(url)) {
      throw new Error(`Refusing to run integration tests against a non-test database: "${url}"`);
    }

    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true })],
      providers: [
        PrismaService,
        DiscountRepository,
        // CartService is only used by `preview`, never by `redeem`.
        {
          provide: DiscountService,
          useFactory: (repo: DiscountRepository) => new DiscountService(repo, null as never),
          inject: [DiscountRepository],
        },
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();

    prisma = moduleRef.get(PrismaService);
    service = moduleRef.get(DiscountService);

    const suffix = randomUUID();
    const userA = await prisma.user.create({
      data: { email: `discount-a-${suffix}@test.local`, passwordHash: 'x' },
    });
    const userB = await prisma.user.create({
      data: { email: `discount-b-${suffix}@test.local`, passwordHash: 'x' },
    });
    userAId = userA.id;
    userBId = userB.id;
  });

  afterEach(async () => {
    await prisma.discountRedemption.deleteMany({});
    await prisma.discount.deleteMany({});
  });

  afterAll(async () => {
    await prisma.discountRedemption.deleteMany({});
    await prisma.discount.deleteMany({});
    await prisma.user.deleteMany({ where: { id: { in: [userAId, userBId] } } });
    await app.close();
  });

  /** Create a discount row with the caps under test. */
  async function makeDiscount(overrides: {
    maxRedemptions?: number | null;
    perUserLimit?: number | null;
    redeemedCount?: number;
  }): Promise<string> {
    const discount = await prisma.discount.create({
      data: {
        code: `INT-${randomUUID().slice(0, 8)}`.toUpperCase(),
        type: 'PERCENT',
        value: '10',
        maxRedemptions: overrides.maxRedemptions ?? null,
        perUserLimit: overrides.perUserLimit ?? null,
        redeemedCount: overrides.redeemedCount ?? 0,
      },
    });
    return discount.id;
  }

  /** Redeem inside its own transaction, exactly as `createOrder` does. */
  function redeemInTx(discountId: string, userId: string, orderId: string): Promise<void> {
    return prisma.$transaction((tx) => service.redeem(discountId, userId, orderId, tx));
  }

  function rejectionCodes(results: PromiseSettledResult<unknown>[]): unknown[] {
    return results
      .filter((r): r is PromiseRejectedResult => r.status === 'rejected')
      .map((r) => (r.reason as { getResponse?: () => unknown }).getResponse?.());
  }

  it('does not overshoot the global cap when two redemptions race for the last slot', async () => {
    const discountId = await makeDiscount({ maxRedemptions: 1 });

    const results = await Promise.allSettled([
      redeemInTx(discountId, userAId, randomUUID()),
      redeemInTx(discountId, userBId, randomUUID()),
    ]);

    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(rejectionCodes(results)).toEqual([
      expect.objectContaining({ error: DiscountErrorCode.MAX_REDEMPTIONS_REACHED }),
    ]);

    const row = await prisma.discount.findUniqueOrThrow({ where: { id: discountId } });
    expect(row.redeemedCount).toBe(1);
    expect(await prisma.discountRedemption.count({ where: { discountId } })).toBe(1);
  });

  it('does not overshoot the per-user cap when the SAME user races two redemptions', async () => {
    const discountId = await makeDiscount({ maxRedemptions: null, perUserLimit: 1 });

    const results = await Promise.allSettled([
      redeemInTx(discountId, userAId, randomUUID()),
      redeemInTx(discountId, userAId, randomUUID()),
    ]);

    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(rejectionCodes(results)).toEqual([
      expect.objectContaining({ error: DiscountErrorCode.USER_LIMIT_REACHED }),
    ]);

    const row = await prisma.discount.findUniqueOrThrow({ where: { id: discountId } });
    expect(row.redeemedCount).toBe(1); // the loser's increment rolled back
    expect(await prisma.discountRedemption.count({ where: { discountId, userId: userAId } })).toBe(
      1,
    );
  });

  it('lets both redemptions through when the cap has room for them', async () => {
    const discountId = await makeDiscount({ maxRedemptions: 5 });

    const results = await Promise.allSettled([
      redeemInTx(discountId, userAId, randomUUID()),
      redeemInTx(discountId, userBId, randomUUID()),
    ]);

    expect(results.every((r) => r.status === 'fulfilled')).toBe(true);

    const row = await prisma.discount.findUniqueOrThrow({ where: { id: discountId } });
    expect(row.redeemedCount).toBe(2);
    expect(await prisma.discountRedemption.count({ where: { discountId } })).toBe(2);
  });

  it('rejects a redemption of an already exhausted code', async () => {
    const discountId = await makeDiscount({ maxRedemptions: 2, redeemedCount: 2 });

    await expect(redeemInTx(discountId, userAId, randomUUID())).rejects.toMatchObject({
      status: 409,
    });

    const row = await prisma.discount.findUniqueOrThrow({ where: { id: discountId } });
    expect(row.redeemedCount).toBe(2);
  });
});

/**
 * TASK-771 — the promo slot follows the order's lifecycle, proven against a real
 * Postgres. Before the fix `cancelAndRestock` returned the stock but kept the
 * `DiscountRedemption` row and `redeemedCount`: an abandoned card payment that
 * the TTL worker auto-cancelled left a `perUserLimit = 1` code permanently
 * unusable for that customer. The pair: `reviveAndReserve` must claim the slot
 * back under the same caps, or refuse the revive.
 *
 * Kept in this file (not a spec of its own) on purpose: the describe above wipes
 * every discount row in its `afterEach`, so a parallel worker running it next to
 * a sibling spec would delete that spec's discounts mid-test.
 */
describe('OrderRepository cancel/revive — promo redemption lifecycle (integration)', () => {
  let prisma: PrismaService;
  let repo: OrderRepository;
  let service: DiscountService;

  let userAId: string;
  let userBId: string;
  let categoryId: string;
  let productId: string;

  const INITIAL_STOCK = 10;
  const ORDERED_QTY = 2;

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
        DiscountRepository,
        {
          provide: DiscountService,
          useFactory: (discountRepo: DiscountRepository) =>
            new DiscountService(discountRepo, null as never),
          inject: [DiscountRepository],
        },
        // Cache eviction and search reindex run after commit and are not what is
        // under test here.
        { provide: CacheService, useValue: { del: jest.fn(), delByPrefix: jest.fn() } },
        {
          provide: ProductIndexer,
          useValue: {
            index: jest.fn().mockResolvedValue(undefined),
            remove: jest.fn().mockResolvedValue(undefined),
          },
        },
      ],
    }).compile();

    prisma = moduleRef.get(PrismaService);
    repo = moduleRef.get(OrderRepository);
    service = moduleRef.get(DiscountService);
    await prisma.$connect();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    const suffix = randomUUID().slice(0, 8);
    const category = await prisma.category.create({
      data: { name: `promo-cat-${suffix}`, slug: `promo-cat-${suffix}` },
    });
    categoryId = category.id;
    const product = await prisma.product.create({
      data: {
        name: `promo-prod-${suffix}`,
        slug: `promo-prod-${suffix}`,
        price: 100,
        stock: INITIAL_STOCK,
        categoryId,
      },
    });
    productId = product.id;
    const userA = await prisma.user.create({
      data: { email: `promo-a-${suffix}@test.local`, passwordHash: 'x' },
    });
    const userB = await prisma.user.create({
      data: { email: `promo-b-${suffix}@test.local`, passwordHash: 'x' },
    });
    userAId = userA.id;
    userBId = userB.id;
  });

  afterEach(async () => {
    const userIds = [userAId, userBId];
    const orders = await prisma.order.findMany({
      where: { userId: { in: userIds } },
      select: { id: true },
    });
    const orderIds = orders.map((o) => o.id);
    await prisma.orderStatusHistory.deleteMany({ where: { orderId: { in: orderIds } } });
    await prisma.orderItem.deleteMany({ where: { orderId: { in: orderIds } } });
    await prisma.order.deleteMany({ where: { id: { in: orderIds } } });
    await prisma.discountRedemption.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.discount.deleteMany({ where: { code: { startsWith: 'LIFE-' } } });
    await prisma.product.deleteMany({ where: { id: productId } });
    await prisma.category.deleteMany({ where: { id: categoryId } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  });

  async function makeDiscount(caps: {
    maxRedemptions?: number | null;
    perUserLimit?: number | null;
  }): Promise<{ id: string; code: string }> {
    return prisma.discount.create({
      data: {
        code: `LIFE-${randomUUID().slice(0, 8)}`.toUpperCase(),
        type: 'PERCENT',
        value: '10',
        maxRedemptions: caps.maxRedemptions ?? null,
        perUserLimit: caps.perUserLimit ?? null,
      },
      select: { id: true, code: true },
    });
  }

  /**
   * A PENDING order that redeemed `discount`, exactly as createFromCart leaves
   * it: stock reserved, `discountCode` snapshotted, one slot claimed.
   */
  async function placeOrderWithCode(
    discount: { id: string; code: string },
    userId: string,
  ): Promise<string> {
    const order = await prisma.order.create({
      data: {
        userId,
        status: OrderStatus.PENDING,
        paymentStatus: PaymentStatus.PENDING,
        subtotal: 200,
        discount: 20,
        discountCode: discount.code,
        total: 180,
        shippingCost: 0,
        shippingAddress: { city: 'Київ', warehouse: '1' },
        items: { create: [{ productId, quantity: ORDERED_QTY, price: 100 }] },
      },
    });
    await prisma.product.update({
      where: { id: productId },
      data: { stock: { decrement: ORDERED_QTY } },
    });
    await prisma.$transaction((tx) => service.redeem(discount.id, userId, order.id, tx));
    return order.id;
  }

  const redeemedCount = async (discountId: string) =>
    (await prisma.discount.findUniqueOrThrow({ where: { id: discountId } })).redeemedCount;

  const stockNow = async () =>
    (await prisma.product.findUniqueOrThrow({ where: { id: productId } })).stock;

  it('cancel releases the redemption, so the customer can use a perUserLimit=1 code again', async () => {
    const discount = await makeDiscount({ perUserLimit: 1, maxRedemptions: 5 });
    const orderId = await placeOrderWithCode(discount, userAId);
    expect(await redeemedCount(discount.id)).toBe(1);

    await repo.cancelAndRestock(orderId, null);

    expect(await redeemedCount(discount.id)).toBe(0);
    expect(await prisma.discountRedemption.count({ where: { orderId } })).toBe(0);
    // The customer is not locked out: a fresh order redeems the code.
    await expect(
      prisma.$transaction((tx) => service.redeem(discount.id, userAId, randomUUID(), tx)),
    ).resolves.toBeUndefined();
  });

  it('revive re-claims the slot and re-creates the redemption for the same order', async () => {
    const discount = await makeDiscount({ perUserLimit: 1, maxRedemptions: 5 });
    const orderId = await placeOrderWithCode(discount, userAId);
    await repo.cancelAndRestock(orderId, null);

    await repo.reviveAndReserve(orderId, OrderStatus.PENDING, PaymentStatus.PAID, null);

    expect(await redeemedCount(discount.id)).toBe(1);
    const redemption = await prisma.discountRedemption.findUniqueOrThrow({ where: { orderId } });
    expect(redemption).toMatchObject({ discountId: discount.id, userId: userAId });
    expect(await stockNow()).toBe(INITIAL_STOCK - ORDERED_QTY);
  });

  it('revive fails with MAX_REDEMPTIONS_REACHED when the freed slot was taken, and rolls back', async () => {
    const discount = await makeDiscount({ maxRedemptions: 1 });
    const orderId = await placeOrderWithCode(discount, userAId);
    await repo.cancelAndRestock(orderId, null);
    // Another customer takes the only slot while the order is cancelled.
    await prisma.$transaction((tx) => service.redeem(discount.id, userBId, randomUUID(), tx));

    const err = await repo
      .reviveAndReserve(orderId, OrderStatus.PENDING, PaymentStatus.PAID, null)
      .catch((e: unknown) => e);

    expect(err).toBeInstanceOf(ConflictException);
    expect((err as ConflictException).getResponse()).toMatchObject({
      error: DiscountErrorCode.MAX_REDEMPTIONS_REACHED,
    });
    // Nothing of the revive committed: status, stock, counter, redemption.
    const order = await prisma.order.findUniqueOrThrow({ where: { id: orderId } });
    expect(order.status).toBe(OrderStatus.CANCELLED);
    expect(order.restockedAt).not.toBeNull();
    expect(await stockNow()).toBe(INITIAL_STOCK);
    expect(await redeemedCount(discount.id)).toBe(1);
    expect(await prisma.discountRedemption.count({ where: { orderId } })).toBe(0);
  });

  it('revive fails with USER_LIMIT_REACHED when the customer re-used the code meanwhile', async () => {
    const discount = await makeDiscount({ perUserLimit: 1 });
    const orderId = await placeOrderWithCode(discount, userAId);
    await repo.cancelAndRestock(orderId, null);
    await prisma.$transaction((tx) => service.redeem(discount.id, userAId, randomUUID(), tx));

    const err = await repo
      .reviveAndReserve(orderId, OrderStatus.PENDING, PaymentStatus.PAID, null)
      .catch((e: unknown) => e);

    expect(err).toBeInstanceOf(ConflictException);
    expect((err as ConflictException).getResponse()).toMatchObject({
      error: DiscountErrorCode.USER_LIMIT_REACHED,
    });
    expect(await redeemedCount(discount.id)).toBe(1);
    expect(await stockNow()).toBe(INITIAL_STOCK);
  });
});
