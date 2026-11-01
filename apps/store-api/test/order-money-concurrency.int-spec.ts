import { ConflictException } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { MoneyEntryKind, OrderStatus, PaymentStatus } from '@prisma/client';
import { OrderMoneyRepository } from '../src/order/order-money.repository';
import { OrderErrorCode } from '../src/order/order.errors';
import { PrismaService } from '../src/prisma';

/**
 * Two payouts racing on one order (TASK-951, R2 step A1) — the REAL repository
 * against a REAL Postgres.
 *
 * Before R2 two refund paths each checked their own journal, so 600 + 500 out of
 * 1 000 both passed. The ledger's ceiling (paid − refunded) is read under
 * `SELECT … FOR UPDATE` of the order row, the first statement of every money
 * transaction, so the second payout waits for the first to commit and then sees
 * it. Each body sleeps between its insert and its recompute: without the lock
 * both would insert before either recomputed, and the loser would die on the
 * `refunded_kop <= paid_kop` CHECK instead of the domain 409 asserted here.
 *
 * Requires an isolated `*_test` database (setup-int.ts forces DATABASE_URL).
 */
describe('OrderMoneyRepository — concurrent payouts over the ceiling (integration)', () => {
  let prisma: PrismaService;
  let repository: OrderMoneyRepository;
  let orderId: string;

  beforeAll(async () => {
    const url = process.env.DATABASE_URL ?? '';
    if (!/test/i.test(url)) {
      throw new Error(`Refusing to run integration tests against a non-test database: "${url}"`);
    }
    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true })],
      providers: [PrismaService, OrderMoneyRepository],
    }).compile();
    prisma = moduleRef.get(PrismaService);
    repository = moduleRef.get(OrderMoneyRepository);
    await prisma.$connect();
  });

  beforeEach(async () => {
    const order = await prisma.order.create({
      data: {
        status: OrderStatus.CANCELLED,
        paymentStatus: PaymentStatus.PENDING,
        subtotal: 1000,
        total: 1000,
        shippingAddress: { city: 'Київ' },
      },
    });
    orderId = order.id;
    await repository.transaction(orderId, async (tx) => {
      await repository.insertEntry(tx, {
        orderId,
        kind: MoneyEntryKind.BANK_TRANSFER,
        amountKop: 100_000,
      });
      await repository.recompute(tx, orderId, null);
    });
  });

  afterEach(async () => {
    await prisma.orderMoneyEntry.deleteMany({ where: { orderId } });
    await prisma.orderStatusHistory.deleteMany({ where: { orderId } });
    await prisma.order.delete({ where: { id: orderId } });
  });

  afterAll(async () => {
    await prisma?.$disconnect();
  });

  const payOut = (amountKop: number) =>
    repository.transaction(orderId, async (tx) => {
      await repository.insertEntry(tx, {
        orderId,
        kind: MoneyEntryKind.TRANSFER_REFUND,
        amountKop,
        reason: 'race',
      });
      await tx.$executeRaw`SELECT pg_sleep(0.3)`;
      await repository.recompute(tx, orderId, null);
    });

  it('of 600 + 500 out of 1 000 exactly one wins; the other gets the domain 409', async () => {
    const results = await Promise.allSettled([payOut(60_000), payOut(50_000)]);

    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    const rejected = results.filter((r): r is PromiseRejectedResult => r.status === 'rejected');
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect(rejected[0].reason).toBeInstanceOf(ConflictException);
    expect(rejected[0].reason).toMatchObject({
      response: { error: OrderErrorCode.MONEY_REFUND_EXCEEDS_PAID },
    });

    const order = await prisma.order.findUniqueOrThrow({ where: { id: orderId } });
    expect(order.refundedKop).toBeLessThanOrEqual(order.paidKop);
    expect([60_000, 50_000]).toContain(order.refundedKop);
    expect(
      await prisma.orderMoneyEntry.count({
        where: { orderId, kind: MoneyEntryKind.TRANSFER_REFUND },
      }),
    ).toBe(1);
  });

  it('two payouts that fit together both land, serialised', async () => {
    const results = await Promise.allSettled([payOut(40_000), payOut(50_000)]);

    expect(results.every((r) => r.status === 'fulfilled')).toBe(true);
    const order = await prisma.order.findUniqueOrThrow({ where: { id: orderId } });
    expect(order.refundedKop).toBe(90_000);
    expect(order.paymentStatus).toBe(PaymentStatus.PARTIALLY_REFUNDED);
  });
});
