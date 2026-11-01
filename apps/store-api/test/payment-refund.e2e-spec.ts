import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';
import {
  DeliveryMethod,
  MoneyDirection,
  MoneyEntryKind,
  MoneyProviderState,
  OrderHistoryChangeType,
  OrderHistoryNote,
  OrderStatus,
  PaymentAttemptStatus,
  PaymentMethod,
  PaymentStatus,
  Prisma,
  type Payment,
} from '@prisma/client';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { AuthRepository } from '../src/auth/auth.repository';
import { PermissionRepository } from '../src/auth/permissions';
import { signLiqPayData } from '../src/payment/adapters/liqpay/liqpay.signature';
import { PrismaService } from '../src/prisma';
import { createLedgerPrismaMock, type LedgerOrderState } from './ledger-prisma.mock';
import { createPermissionRepositoryMock } from './permission-repository.mock';

/**
 * E2E: a LiqPay `reversed` callback (TASK-618 → TASK-1500, R2 A2).
 *
 * The whole chain runs for real — signature verification and the dedupe key in
 * the LiqPay adapter, PaymentService (money check, idempotency claim),
 * OrderService (the plan) and the order + ledger repositories. Only
 * `PrismaService` is a double (with an in-memory ledger), so the assertions are
 * on what would have been WRITTEN.
 *
 * The contract changed in R2 A2, intentionally: the money of a refund is what
 * the SHOP requested — a REQUESTED `LIQPAY_REFUND` entry — and the callback
 * only CONFIRMS the oldest such request. Its `amount` (single refund or running
 * total — LiqPay does not say) no longer decides partial vs full; the payment
 * status is derived from the ledger. A `reversed` nobody requested (a refund
 * made in the LiqPay cabinet) writes no money: one PROVIDER_REFUND_UNMATCHED
 * history row for the operator to record it by hand.
 */

class ThrottlerGuardPassThrough extends ThrottlerGuard {
  protected async handleRequest(): Promise<boolean> {
    return true;
  }
}

const PAYMENT_ID = '550e8400-e29b-41d4-a716-446655440618';
const ORDER_ID = '550e8400-e29b-41d4-a716-4466554406ff';
const CHARGED = '1249.00';
const CHARGED_KOP = 124_900;

describe('LiqPay reversed callback → the order ledger (e2e, TASK-618 / TASK-1500)', () => {
  let app: INestApplication;
  let privateKey: string;

  const orderRow: LedgerOrderState = {
    id: ORDER_ID,
    total: CHARGED,
    status: OrderStatus.DELIVERED,
    paymentStatus: PaymentStatus.PAID,
    paymentMethod: PaymentMethod.ONLINE,
    deliveryMethod: DeliveryMethod.NOVA_POSHTA,
  };
  const ledger = createLedgerPrismaMock(() => orderRow);

  const prismaServiceMock = {
    $connect: jest.fn(),
    $disconnect: jest.fn(),
    $on: jest.fn(),
    ...ledger.prisma,
    payment: { findUnique: jest.fn(), update: jest.fn(), findFirst: jest.fn() },
    paymentEvent: { create: jest.fn(), delete: jest.fn() },
    order: { update: jest.fn(), updateMany: jest.fn(), findUniqueOrThrow: jest.fn() },
    orderStatusHistory: { create: jest.fn(), count: jest.fn() },
    $transaction: jest.fn(),
  };

  /**
   * One row serves both reads: PaymentRepository.findById (the whole Payment)
   * and OrderRepository.findPaymentWithOrder (a select that nests the order).
   * The ledger starts with the attempt's receipt, as the success callback wrote it.
   */
  const seedPaidOrder = () => {
    orderRow.status = OrderStatus.DELIVERED;
    orderRow.paymentStatus = PaymentStatus.PAID;
    const row: Payment & { order: Record<string, unknown> } = {
      id: PAYMENT_ID,
      orderId: ORDER_ID,
      provider: 'liqpay',
      providerPaymentId: '777',
      amount: new Prisma.Decimal(CHARGED),
      refundedAmount: new Prisma.Decimal(0),
      currency: 'UAH',
      status: PaymentAttemptStatus.SUCCEEDED,
      failureCode: null,
      failureMessage: null,
      settledAt: new Date('2026-09-20T10:00:00.000Z'),
      createdAt: new Date('2026-09-20T09:55:00.000Z'),
      updatedAt: new Date('2026-09-20T10:00:00.000Z'),
      order: {
        id: ORDER_ID,
        get status() {
          return orderRow.status;
        },
        get paymentStatus() {
          return orderRow.paymentStatus;
        },
        paidAt: new Date('2026-09-20T10:00:00.000Z'),
        reservationExpiresAt: null,
        restockedAt: null,
        paymentMethod: PaymentMethod.ONLINE,
        userId: null,
      },
    } as Payment & { order: Record<string, unknown> };
    prismaServiceMock.payment.findUnique.mockResolvedValue(row);
    void prismaServiceMock.orderMoneyEntry.create({
      data: {
        orderId: ORDER_ID,
        direction: MoneyDirection.IN,
        kind: MoneyEntryKind.LIQPAY_PAYMENT,
        amountKop: CHARGED_KOP,
        paymentId: PAYMENT_ID,
        providerRef: 'success',
        providerState: null,
      },
    });
  };

  /** A refund the shop requested (what `PaymentService.refund` writes first). */
  const seedRequestedRefund = (amountKop: number, ref: string) =>
    prismaServiceMock.orderMoneyEntry.create({
      data: {
        orderId: ORDER_ID,
        direction: MoneyDirection.OUT,
        kind: MoneyEntryKind.LIQPAY_REFUND,
        amountKop,
        paymentId: PAYMENT_ID,
        providerRef: ref,
        providerState: MoneyProviderState.REQUESTED,
      },
    });

  /** A signed LiqPay callback body, exactly as LiqPay would POST it. */
  const reversedCallback = (amount: string, refundDateLast = 1761990000000) => {
    const data = Buffer.from(
      JSON.stringify({
        order_id: PAYMENT_ID,
        status: 'reversed',
        payment_id: 777,
        amount,
        currency: 'UAH',
        refund_date_last: refundDateLast,
      }),
    ).toString('base64');
    return { data, signature: signLiqPayData(data, privateKey) };
  };

  const historyRows = () =>
    prismaServiceMock.orderStatusHistory.create.mock.calls.map(
      (call) => (call[0] as { data: Record<string, unknown> }).data,
    );

  const refundEntries = () =>
    ledger.entries.filter((row) => row.kind === MoneyEntryKind.LIQPAY_REFUND);

  beforeAll(async () => {
    // Test keys, so the real adapter verifies the signature. If the local env
    // file already configures LiqPay, ConfigService may prefer those — which is
    // why the signing key is read back from ConfigService below, not assumed.
    process.env.LIQPAY_PUBLIC_KEY = process.env.LIQPAY_PUBLIC_KEY || 'sandbox_i000000e2e';
    process.env.LIQPAY_PRIVATE_KEY =
      process.env.LIQPAY_PRIVATE_KEY || 'sandbox_e2e_private_key_for_task_618';

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true, envFilePath: ['.env'] }),
        ThrottlerModule.forRoot([{ ttl: 60000, limit: 100000 }]),
        AppModule,
      ],
    })
      .overrideProvider(PrismaService)
      .useValue(prismaServiceMock)
      .overrideProvider(PermissionRepository)
      .useValue(createPermissionRepositoryMock())
      .overrideProvider(AuthRepository)
      .useValue({})
      .overrideProvider(APP_GUARD)
      .useClass(ThrottlerGuardPassThrough)
      .compile();

    privateKey = moduleFixture.get(ConfigService).get<string>('LIQPAY_PRIVATE_KEY') as string;

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
        transformOptions: { enableImplicitConversion: true },
      }),
    );
    app.setGlobalPrefix('api', { exclude: ['health'] });
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    jest.clearAllMocks();
    ledger.reset();
    prismaServiceMock.paymentEvent.create.mockResolvedValue({ id: 'evt-618' });
    prismaServiceMock.payment.update.mockResolvedValue({});
    prismaServiceMock.payment.findFirst.mockResolvedValue({
      status: PaymentAttemptStatus.SUCCEEDED,
    });
    prismaServiceMock.order.updateMany.mockImplementation(
      async ({ data }: { data: { status?: OrderStatus } }) => {
        if (data.status) orderRow.status = data.status;
        return { count: 1 };
      },
    );
    prismaServiceMock.order.findUniqueOrThrow.mockImplementation(async () => ({
      ...orderRow,
      items: [],
    }));
    prismaServiceMock.order.update.mockImplementation(
      async ({ data }: { data: { paymentStatus?: PaymentStatus } }) => {
        if (data.paymentStatus) orderRow.paymentStatus = data.paymentStatus;
        return {};
      },
    );
    prismaServiceMock.orderStatusHistory.create.mockResolvedValue({});
    prismaServiceMock.orderStatusHistory.count.mockResolvedValue(0);
    prismaServiceMock.$transaction.mockImplementation(
      (fn: (tx: typeof prismaServiceMock) => unknown) => fn(prismaServiceMock),
    );
  });

  const url = '/api/payments/liqpay/callback';

  it('confirms a requested PARTIAL refund; a DELIVERED order stays DELIVERED', async () => {
    seedPaidOrder();
    await seedRequestedRefund(20_000, 'req-1');
    orderRow.paymentStatus = PaymentStatus.PARTIALLY_REFUNDED;

    await request(app.getHttpServer())
      .post(url)
      .send(reversedCallback('200.00'))
      .expect(200, { data: { received: true } });

    expect(refundEntries()).toEqual([
      expect.objectContaining({ amountKop: 20_000, providerState: MoneyProviderState.CONFIRMED }),
    ]);
    expect(orderRow).toMatchObject({
      status: OrderStatus.DELIVERED,
      paymentStatus: PaymentStatus.PARTIALLY_REFUNDED,
    });
    // Nothing new to say in the timeline: the status was already derived when
    // the refund was requested.
    expect(historyRows()).toEqual([]);
    // The attempt is not marked REFUNDED — the rest may still be refunded.
    expect(prismaServiceMock.payment.update).not.toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: PaymentAttemptStatus.REFUNDED } }),
    );
    expect(prismaServiceMock.paymentEvent.delete).not.toHaveBeenCalled();
  });

  it('confirms a requested FULL refund: attempt REFUNDED; the order stays DELIVERED (TASK-1969)', async () => {
    seedPaidOrder();
    await seedRequestedRefund(CHARGED_KOP, 'req-1');
    orderRow.paymentStatus = PaymentStatus.REFUNDED;

    await request(app.getHttpServer())
      .post(url)
      .send(reversedCallback(CHARGED))
      .expect(200, { data: { received: true } });

    expect(refundEntries()[0]).toMatchObject({ providerState: MoneyProviderState.CONFIRMED });
    expect(prismaServiceMock.payment.update).toHaveBeenLastCalledWith({
      where: { id: PAYMENT_ID },
      data: { status: PaymentAttemptStatus.REFUNDED },
    });
    // R2 A4: a provider refund alone never ends an order — its REFUNDED is
    // derived from returns covering every line, and this order has none.
    expect(orderRow.status).toBe(OrderStatus.DELIVERED);
    expect(historyRows()).toEqual([]);
  });

  it('two partial reversals with different stamps are two events, both confirmed', async () => {
    seedPaidOrder();
    await seedRequestedRefund(20_000, 'req-1');
    await seedRequestedRefund(30_000, 'req-2');
    orderRow.paymentStatus = PaymentStatus.PARTIALLY_REFUNDED;

    await request(app.getHttpServer()).post(url).send(reversedCallback('200.00', 1)).expect(200);
    await request(app.getHttpServer()).post(url).send(reversedCallback('300.00', 2)).expect(200);

    const keys = prismaServiceMock.paymentEvent.create.mock.calls.map(
      (call) => (call[0] as { data: { dedupeKey: string } }).data.dedupeKey,
    );
    expect(keys).toHaveLength(2);
    expect(keys[0]).not.toBe('');
    expect(keys[0]).not.toBe(keys[1]);
    expect(refundEntries().map((row) => row.providerState)).toEqual([
      MoneyProviderState.CONFIRMED,
      MoneyProviderState.CONFIRMED,
    ]);
  });

  it('a refund nobody requested (LiqPay cabinet) writes no money, only a note', async () => {
    seedPaidOrder();

    await request(app.getHttpServer())
      .post(url)
      .send(reversedCallback('300.00'))
      .expect(200, { data: { received: true } });

    expect(refundEntries()).toEqual([]);
    expect(historyRows()).toEqual([
      {
        orderId: ORDER_ID,
        changeType: OrderHistoryChangeType.PAYMENT_STATUS,
        fromPaymentStatus: PaymentStatus.PAID,
        toPaymentStatus: PaymentStatus.PAID,
        note: OrderHistoryNote.PROVIDER_REFUND_UNMATCHED,
        changedBy: null,
      },
    ]);
    expect(orderRow).toMatchObject({
      status: OrderStatus.DELIVERED,
      paymentStatus: PaymentStatus.PAID,
    });
  });

  it('still refuses a reversal larger than the charge, before recording it', async () => {
    seedPaidOrder();

    await request(app.getHttpServer()).post(url).send(reversedCallback('5000.00')).expect(400);

    expect(prismaServiceMock.paymentEvent.create).not.toHaveBeenCalled();
    expect(prismaServiceMock.order.updateMany).not.toHaveBeenCalled();
  });
});
