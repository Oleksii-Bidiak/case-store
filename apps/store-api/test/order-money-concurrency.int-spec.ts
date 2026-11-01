import { ConflictException } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import {
  MoneyEntryKind,
  MoneyProviderState,
  OrderStatus,
  PaymentAttemptStatus,
  PaymentStatus,
} from '@prisma/client';
import type { CacheService } from '../src/cache';
import { OrderMoneyRepository } from '../src/order/order-money.repository';
import { OrderRepository } from '../src/order/order.repository';
import { OrderErrorCode } from '../src/order/order.errors';
import { PrismaService } from '../src/prisma';
import type { ProductIndexer } from '../src/search/product-indexer';

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

  /**
   * R2 pre-merge review: the doors are different — a cash payout, a LiqPay
   * refund request, the `reversed` webhook — but they share the one order-row
   * lock, so the ceiling holds across them. The order now holds 2 000 ₴: the
   * 1 000 transfer above plus a 1 000 LiqPay payment.
   */
  describe('across doors (cash payout, LiqPay request, reversed webhook)', () => {
    let orders: OrderRepository;
    let paymentId: string;

    beforeAll(() => {
      orders = new OrderRepository(prisma, {} as CacheService, {} as ProductIndexer, repository);
    });

    beforeEach(async () => {
      const payment = await prisma.payment.create({
        data: {
          orderId,
          provider: 'liqpay',
          amount: 1000,
          currency: 'UAH',
          status: PaymentAttemptStatus.SUCCEEDED,
        },
      });
      paymentId = payment.id;
      await repository.transaction(orderId, async (tx) => {
        await repository.insertEntry(tx, {
          orderId,
          kind: MoneyEntryKind.LIQPAY_PAYMENT,
          amountKop: 100_000,
          paymentId,
          providerRef: 'success',
        });
        await repository.recompute(tx, orderId, null);
      });
    });

    afterEach(async () => {
      await prisma.orderMoneyEntry.deleteMany({ where: { orderId } });
      await prisma.payment.deleteMany({ where: { orderId } });
    });

    /** The LiqPay door; it sleeps under the lock so the cash payout queues behind it. */
    const requestLiqPay = (amountKop: number) =>
      orders.requestProviderRefund({
        orderId,
        paymentId,
        amountKop,
        actorId: null,
        reason: 'race',
        guard: async (tx) => {
          await tx.$executeRaw`SELECT pg_sleep(0.3)`;
        },
      });

    it('a cash payout and a LiqPay refund cannot both spend the same money', async () => {
      // 1 500 + 600 out of 2 000: whichever takes the lock second is refused.
      const [cash, liqpay] = await Promise.allSettled([payOut(150_000), requestLiqPay(60_000)]);

      const liqpayWritten = liqpay.status === 'fulfilled' && liqpay.value.status === 'requested';
      const cashWritten = cash.status === 'fulfilled';
      expect([cashWritten, liqpayWritten].filter(Boolean)).toHaveLength(1);
      if (cash.status === 'rejected') {
        expect(cash.reason).toMatchObject({
          response: { error: OrderErrorCode.MONEY_REFUND_EXCEEDS_PAID },
        });
      }

      const order = await prisma.order.findUniqueOrThrow({ where: { id: orderId } });
      expect(order.paidKop).toBe(200_000);
      expect(order.refundedKop).toBeLessThanOrEqual(order.paidKop);
      expect([150_000, 60_000]).toContain(order.refundedKop);
    });

    it('the reversed webhook confirms without moving money; a racing payout still sees the request', async () => {
      const requested = await requestLiqPay(60_000);
      expect(requested.status).toBe('requested');

      const webhook = orders.applyPaymentOutcome({
        paymentId,
        orderId,
        expected: {
          status: OrderStatus.CANCELLED,
          paymentStatus: PaymentStatus.PARTIALLY_REFUNDED,
        },
        attemptStatus: PaymentAttemptStatus.SUCCEEDED,
        providerRefund: { providerAmountKop: 60_000 },
      });
      // 2 000 − 600 requested = 1 400 left: one kopeck more is refused either way.
      const [confirmed, cash] = await Promise.allSettled([webhook, payOut(140_001)]);

      expect(confirmed.status).toBe('fulfilled');
      expect(cash.status).toBe('rejected');
      expect((cash as PromiseRejectedResult).reason).toMatchObject({
        response: { error: OrderErrorCode.MONEY_REFUND_EXCEEDS_PAID },
      });
      const entry = await prisma.orderMoneyEntry.findFirstOrThrow({
        where: { orderId, kind: MoneyEntryKind.LIQPAY_REFUND },
      });
      expect(entry.providerState).toBe(MoneyProviderState.CONFIRMED);
      const order = await prisma.order.findUniqueOrThrow({ where: { id: orderId } });
      expect(order.refundedKop).toBe(60_000);

      // What does fit still lands after the confirmation.
      await payOut(140_000);
      const after = await prisma.order.findUniqueOrThrow({ where: { id: orderId } });
      expect(after.refundedKop).toBe(after.paidKop);
    });
  });
});
