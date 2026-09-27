import { BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OrderStatus, PaymentAttemptStatus, PaymentStatus } from '@prisma/client';
import type { PinoLogger } from 'nestjs-pino';
import { randomUUID } from 'crypto';
import type { OrderService } from '../src/order';
import type { PaymentProvider } from '../src/payment/payment.port';
import { PaymentRepository } from '../src/payment/payment.repository';
import { PaymentService } from '../src/payment/payment.service';
import { PrismaService } from '../src/prisma';

/**
 * Integration test for the cumulative refund ceiling on a payment attempt
 * (TASK-1302) — the REAL service and repository against a REAL Postgres,
 * because the ceiling is a running total and only the row lock taken by the
 * conditional UPDATE makes it hold between two simultaneous refunds. It also
 * proves the raw `UPDATE "payments"` against the real table, which every
 * mocked spec takes on faith.
 *
 * Fixture: one SUCCEEDED attempt of 1000.00. The provider is a double that
 * accepts every refund, so what reaches it is what the ceiling let through.
 *
 * Requires an isolated `*_test` database (setup-int.ts forces DATABASE_URL).
 */
describe('PaymentService.refund — cumulative ceiling (integration)', () => {
  let prisma: PrismaService;
  let service: PaymentService;
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
    const logger = { setContext: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() };
    service = new PaymentService(
      new PaymentRepository(prisma),
      provider as unknown as PaymentProvider,
      {} as OrderService,
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
  });

  afterEach(async () => {
    // Scoped to THIS test's rows, and never with an unset id — Prisma drops
    // `{ id: undefined }` and would delete every row on the shared store_test.
    if (!prisma) return;
    if (orderId) {
      await prisma.payment.deleteMany({ where: { orderId } });
      await prisma.orderStatusHistory.deleteMany({ where: { orderId } });
      await prisma.order.deleteMany({ where: { id: orderId } });
    }
    if (userId) await prisma.user.deleteMany({ where: { id: userId } });
    userId = orderId = paymentId = '';
  });

  const refundedOnAttempt = async () =>
    (
      await prisma.payment.findUniqueOrThrow({ where: { id: paymentId } })
    ).refundedAmount.toString();

  it('caps the second partial refund by what the first one left', async () => {
    await service.refund(paymentId, '600.00');

    await expect(service.refund(paymentId, '500.00')).rejects.toThrow(BadRequestException);
    await service.refund(paymentId, '400.00');

    expect(await refundedOnAttempt()).toBe('1000');
    expect(provider.refund).toHaveBeenCalledTimes(2);
    await expect(service.refund(paymentId)).rejects.toThrow(BadRequestException);
  });

  it('lets only one of two concurrent refunds spend the same remainder', async () => {
    const results = await Promise.allSettled([
      service.refund(paymentId, '600.00'),
      service.refund(paymentId, '600.00'),
    ]);

    const rejected = results.filter((r): r is PromiseRejectedResult => r.status === 'rejected');
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect(rejected[0].reason).toBeInstanceOf(BadRequestException);
    expect(provider.refund).toHaveBeenCalledTimes(1);
    expect(await refundedOnAttempt()).toBe('600');
  });

  it('gives the reservation back when the provider refuses', async () => {
    provider.refund.mockRejectedValueOnce(new Error('LiqPay said no'));

    await expect(service.refund(paymentId, '250.00')).rejects.toThrow('LiqPay said no');

    expect(await refundedOnAttempt()).toBe('0');
    await service.refund(paymentId);
    expect(provider.refund).toHaveBeenLastCalledWith({ paymentId, amount: '1000' });
  });
});
