import { INestApplication } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { randomUUID } from 'crypto';
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
