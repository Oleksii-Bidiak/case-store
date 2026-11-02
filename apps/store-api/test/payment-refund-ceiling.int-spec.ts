import { ConflictException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  MoneyDirection,
  MoneyEntryKind,
  MoneyProviderState,
  OrderStatus,
  PaymentAttemptStatus,
  PaymentStatus,
} from '@prisma/client';
import type { PinoLogger } from 'nestjs-pino';
import { randomUUID } from 'crypto';
import type { CacheService } from '../src/cache';
import type { OrderService } from '../src/order';
import { OrderMoneyRepository } from '../src/order/order-money.repository';
import { OrderRepository } from '../src/order/order.repository';
import { RefundOutcomeUnknownException } from '../src/payment/payment.errors';
import type { PaymentProvider } from '../src/payment/payment.port';
import { PaymentRepository } from '../src/payment/payment.repository';
import { PaymentService } from '../src/payment/payment.service';
import { PrismaService } from '../src/prisma';
import type { ProductIndexer } from '../src/search/product-indexer';

/**
 * Integration test for the cumulative refund ceiling on a payment attempt
 * (TASK-1302) — the REAL service and repositories against a REAL Postgres.
 *
 * R2 A2 (TASK-1500 / TASK-2047) changed WHERE the ceiling lives, intentionally:
 * no longer `payments.refunded_amount` reserved by a conditional UPDATE, but the
 * order ledger — each request is a REQUESTED `LIQPAY_REFUND` entry written under
 * the order-row lock, counted at once, voided if the provider refuses. The
 * behaviour this file has always pinned is unchanged: 600 + 500 out of 1000 is
 * refused, two simultaneous requests cannot both spend the same remainder, and
 * a refused request gives its amount back.
 *
 * Fixture: one SUCCEEDED attempt of 1000.00 with its LiqPay receipt on the
 * ledger. The provider is a double that accepts every refund, so what reaches
 * it is what the ceiling let through.
 *
 * Requires an isolated `*_test` database (setup-int.ts forces DATABASE_URL).
 */
describe('PaymentService.requestLedgerRefund — cumulative ceiling (integration)', () => {
  let prisma: PrismaService;
  let service: PaymentService;
  let money: OrderMoneyRepository;
  const provider = { key: 'liqpay', refund: jest.fn() };

  let userId = '';
  let orderId = '';
  let paymentId = '';

  beforeAll(async () => {
    const url = process.env.DATABASE_URL ?? '';
    if (!/test/i.test(url)) {
      throw new Error(`Refusing to run integration tests against a non-test database: "${url}"`);
    }

    prisma = new PrismaService(new ConfigService({ DATABASE_URL: url }));
    await prisma.$connect();
    money = new OrderMoneyRepository(prisma);
    const orders = new OrderRepository(prisma, {} as CacheService, {} as ProductIndexer, money);
    // Only the two ledger doors the refund path uses — the real repository behind them.
    const orderService = {
      requestProviderRefund: orders.requestProviderRefund.bind(orders),
      voidProviderRefund: orders.voidProviderRefund.bind(orders),
    } as unknown as OrderService;
    const logger = { setContext: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() };
    service = new PaymentService(
      new PaymentRepository(prisma),
      provider as unknown as PaymentProvider,
      orderService,
      { get: jest.fn() } as unknown as ConfigService,
      { now: () => new Date() },
      logger as unknown as PinoLogger,
    );
  });

  afterAll(async () => {
    await prisma?.$disconnect();
  });

  beforeEach(async () => {
    provider.refund.mockReset().mockResolvedValue(undefined);
    const suffix = randomUUID().slice(0, 8);

    const user = await prisma.user.create({
      data: { email: `payment-refund-${suffix}@test.local`, passwordHash: 'x' },
    });
    userId = user.id;

    const order = await prisma.order.create({
      data: {
        userId,
        status: OrderStatus.DELIVERED,
        paymentStatus: PaymentStatus.PAID,
        subtotal: 1000,
        discount: 0,
        total: 1000,
        shippingCost: 0,
        shippingAddress: { city: 'Київ', warehouse: '1' },
      },
    });
    orderId = order.id;

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

    // The attempt's receipt, as the webhook (or the R2 backfill) writes it.
    await money.transaction(orderId, async (tx) => {
      await money.insertEntry(tx, {
        orderId,
        kind: MoneyEntryKind.LIQPAY_PAYMENT,
        amountKop: 100_000,
        paymentId,
        providerRef: 'success',
      });
      await money.recompute(tx, orderId, null);
    });
  });

  afterEach(async () => {
    // Scoped to THIS test's rows, and never with an unset id — Prisma drops
    // `{ id: undefined }` and would delete every row on the shared store_test.
    if (!prisma) return;
    if (orderId) {
      await prisma.orderMoneyEntry.deleteMany({ where: { orderId } });
      await prisma.payment.deleteMany({ where: { orderId } });
      await prisma.orderStatusHistory.deleteMany({ where: { orderId } });
      await prisma.order.deleteMany({ where: { id: orderId } });
    }
    if (userId) await prisma.user.deleteMany({ where: { id: userId } });
    userId = orderId = paymentId = '';
  });

  /** Σ of the attempt's refunds the ledger counts (REQUESTED or CONFIRMED, not voided). */
  const refundedOnLedger = async () =>
    (
      await prisma.orderMoneyEntry.aggregate({
        where: {
          paymentId,
          direction: MoneyDirection.OUT,
          kind: MoneyEntryKind.LIQPAY_REFUND,
          voidedAt: null,
        },
        _sum: { amountKop: true },
      })
    )._sum.amountKop ?? 0;

  /** The one LiqPay refund door (`PROVIDER_REFUND_PORT`); no payout guard here. */
  const refund = (amountKop: number) =>
    service.requestLedgerRefund({
      orderId,
      paymentId,
      amountKop,
      actorId: null,
      returnId: null,
      reason: null,
      guard: async () => undefined,
    });

  it('caps the second partial refund by what the first one left', async () => {
    await refund(60_000);

    await expect(refund(50_000)).rejects.toThrow(ConflictException);
    await refund(40_000);

    expect(await refundedOnLedger()).toBe(100_000);
    expect(provider.refund).toHaveBeenCalledTimes(2);
    await expect(refund(1)).rejects.toThrow(ConflictException);
  });

  it('lets only one of two concurrent refunds spend the same remainder', async () => {
    const results = await Promise.allSettled([refund(60_000), refund(60_000)]);

    const rejected = results.filter((r): r is PromiseRejectedResult => r.status === 'rejected');
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect(rejected[0].reason).toBeInstanceOf(ConflictException);
    expect(provider.refund).toHaveBeenCalledTimes(1);
    expect(await refundedOnLedger()).toBe(60_000);
  });

  it('gives the amount back when the provider refuses', async () => {
    provider.refund.mockRejectedValueOnce(new Error('LiqPay said no'));

    await expect(refund(25_000)).rejects.toThrow('LiqPay said no');

    expect(await refundedOnLedger()).toBe(0);
    await refund(100_000);
    expect(provider.refund).toHaveBeenLastCalledWith({ paymentId, amount: '1000.00' });
  });

  // R2 pre-merge review: a lost answer is not a refusal. LiqPay may already have
  // sent the 250 back, so the entry stays REQUESTED and keeps counting — the
  // remainder cannot be refunded (or paid out in cash) a second time; the
  // `reversed` callback or the reconcile poll settles it.
  it('keeps the amount counted when the provider outcome is unknown', async () => {
    const unknown = new RefundOutcomeUnknownException();
    provider.refund.mockRejectedValueOnce(unknown);

    await expect(refund(25_000)).rejects.toBe(unknown);

    expect(await refundedOnLedger()).toBe(25_000);
    const entry = await prisma.orderMoneyEntry.findFirstOrThrow({
      where: { paymentId, kind: MoneyEntryKind.LIQPAY_REFUND },
    });
    expect(entry).toMatchObject({ providerState: MoneyProviderState.REQUESTED, voidedAt: null });
    await expect(refund(100_000)).rejects.toThrow(ConflictException);
  });
});
