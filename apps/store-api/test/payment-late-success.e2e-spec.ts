import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';
import {
  DeliveryMethod,
  MoneyDirection,
  MoneyEntryKind,
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
import { createLedgerPrismaMock, type LedgerOrderState } from './ledger-prisma.mock';
import { AppModule } from '../src/app.module';
import { AuthRepository } from '../src/auth/auth.repository';
import { PermissionRepository } from '../src/auth/permissions';
import { signLiqPayData } from '../src/payment/adapters/liqpay/liqpay.signature';
import { PrismaService } from '../src/prisma';
import { createPermissionRepositoryMock } from './permission-repository.mock';

/**
 * E2E: a LiqPay `success` callback that arrives after the order was cancelled
 * (TASK-619, owner decision B-11 №3 in plan 178).
 *
 * The race: the customer opens the LiqPay page at 14:25, the 30-minute
 * reservation lapses, the reconcile worker cancels the order and returns its
 * stock at 14:30, and the customer pays at 14:35. Before TASK-619 that callback
 * moved the order CANCELLED → CONFIRMED without reserving anything — a paid,
 * confirmed order with zero stock held for it and `restockedAt` still set, so the
 * same units could be sold again.
 *
 * The decision: the money is a fact and is recorded (PAID), the order stays
 * CANCELLED, no stock moves, and the payment's history row carries the
 * «оплачено після скасування» note the operator's «Потребує дії» list reads. The
 * operator then either revives the order (the normal revive path re-reserves
 * stock) or refunds the money. Nothing is automatic.
 *
 * The whole chain runs for real — the LiqPay adapter's signature check,
 * PaymentService, OrderService and both repositories. Only `PrismaService` is a
 * double, so the assertions are on what would have been WRITTEN.
 */

class ThrottlerGuardPassThrough extends ThrottlerGuard {
  protected async handleRequest(): Promise<boolean> {
    return true;
  }
}

const PAYMENT_ID = '550e8400-e29b-41d4-a716-446655440619';
const ORDER_ID = '550e8400-e29b-41d4-a716-4466554406aa';
const CHARGED = '1249.00';

describe('LiqPay success callback after TTL auto-cancel (e2e, TASK-619)', () => {
  let app: INestApplication;
  let privateKey: string;

  /** The order row as the ledger reads it — and as `recompute` updates it. */
  const orderRow: LedgerOrderState = {
    id: ORDER_ID,
    total: CHARGED,
    status: OrderStatus.PENDING,
    paymentStatus: PaymentStatus.PENDING,
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
    product: { update: jest.fn(), updateMany: jest.fn() },
    orderStatusHistory: { create: jest.fn(), count: jest.fn() },
    $transaction: jest.fn(),
  };

  /**
   * One row serves both reads: PaymentRepository.findById (the whole Payment)
   * and OrderRepository.findPaymentWithOrder (a select that nests the order).
   */
  const seedPayment = (orderStatus: OrderStatus, attemptStatus: PaymentAttemptStatus) => {
    orderRow.status = orderStatus;
    orderRow.paymentStatus = PaymentStatus.PENDING;
    const row: Payment & { order: Record<string, unknown> } = {
      id: PAYMENT_ID,
      orderId: ORDER_ID,
      provider: 'liqpay',
      providerPaymentId: null,
      amount: new Prisma.Decimal(CHARGED),
      refundedAmount: new Prisma.Decimal(0),
      currency: 'UAH',
      status: attemptStatus,
      failureCode: null,
      failureMessage: null,
      settledAt: null,
      createdAt: new Date('2026-09-24T14:25:00.000Z'),
      updatedAt: new Date('2026-09-24T14:30:00.000Z'),
      order: {
        id: ORDER_ID,
        status: orderStatus,
        paymentStatus: PaymentStatus.PENDING,
        paidAt: null,
        reservationExpiresAt: new Date('2026-09-24T14:30:00.000Z'),
      },
    } as Payment & { order: Record<string, unknown> };
    prismaServiceMock.payment.findUnique.mockResolvedValue(row);
  };

  /** A signed LiqPay `success` callback body, exactly as LiqPay would POST it. */
  const successCallback = () => {
    const data = Buffer.from(
      JSON.stringify({
        order_id: PAYMENT_ID,
        status: 'success',
        payment_id: 619,
        amount: CHARGED,
        currency: 'UAH',
      }),
    ).toString('base64');
    return { data, signature: signLiqPayData(data, privateKey) };
  };

  /** The single conditional order write the transaction made. */
  const orderWriteCall = () =>
    prismaServiceMock.order.updateMany.mock.calls[0][0] as {
      where: Record<string, unknown>;
      data: Record<string, unknown>;
    };
  const orderWrite = () => orderWriteCall().data;

  /** Every history row the callback wrote, in order. */
  const historyRows = () =>
    prismaServiceMock.orderStatusHistory.create.mock.calls.map(
      (call) => (call[0] as { data: Record<string, unknown> }).data,
    );

  beforeAll(async () => {
    // Test keys, so the real adapter verifies the signature. If the local env
    // file already configures LiqPay, ConfigService may prefer those — which is
    // why the signing key is read back from ConfigService below, not assumed.
    process.env.LIQPAY_PUBLIC_KEY = process.env.LIQPAY_PUBLIC_KEY || 'sandbox_i000000e2e';
    process.env.LIQPAY_PRIVATE_KEY =
      process.env.LIQPAY_PRIVATE_KEY || 'sandbox_e2e_private_key_for_task_619';

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
    prismaServiceMock.paymentEvent.create.mockResolvedValue({ id: 'evt-619' });
    prismaServiceMock.payment.update.mockResolvedValue({});
    prismaServiceMock.payment.findFirst.mockResolvedValue({
      status: PaymentAttemptStatus.SUCCEEDED,
    });
    prismaServiceMock.order.updateMany.mockResolvedValue({ count: 1 });
    // Both the recompute read and the final re-read see the live row.
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

  it('records the money on a CANCELLED order but keeps it CANCELLED, with no stock moved', async () => {
    // The worker marked the attempt EXPIRED when it cancelled the order.
    seedPayment(OrderStatus.CANCELLED, PaymentAttemptStatus.EXPIRED);

    await request(app.getHttpServer())
      .post(url)
      .send(successCallback())
      .expect(200, { data: { received: true } });

    // Conditional on what the plan read — a cancel committed since cannot be overwritten.
    // R2 A2: the payment status is no longer in the condition (nor in the write):
    // it is derived from the ledger by recompute.
    expect(orderWriteCall().where).toEqual({ id: ORDER_ID, status: OrderStatus.CANCELLED });
    const written = orderWrite();
    expect(written).not.toHaveProperty('paymentStatus');
    expect(written.paidAt).toBeInstanceOf(Date);
    // The money itself: ONE LiqPay receipt for the whole charge — real money,
    // so the balance shows it owed back on the cancelled order.
    expect(ledger.entries).toEqual([
      expect.objectContaining({
        direction: MoneyDirection.IN,
        kind: MoneyEntryKind.LIQPAY_PAYMENT,
        amountKop: 124_900,
        paymentId: PAYMENT_ID,
        providerRef: 'success',
        actorId: null,
      }),
    ]);
    expect(prismaServiceMock.order.update).toHaveBeenCalledWith({
      where: { id: ORDER_ID },
      data: expect.objectContaining({
        paidKop: 124_900,
        balanceKop: -124_900,
        paymentStatus: PaymentStatus.PAID,
      }),
    });
    // The order is not revived and the cancellation's restock is not undone.
    expect(written).not.toHaveProperty('status');
    expect(written).not.toHaveProperty('restockedAt');
    expect(prismaServiceMock.product.updateMany).not.toHaveBeenCalled();
    expect(prismaServiceMock.product.update).not.toHaveBeenCalled();

    // One row: the payment move, flagged for the operator. No STATUS row.
    expect(historyRows()).toEqual([
      {
        orderId: ORDER_ID,
        changeType: OrderHistoryChangeType.PAYMENT_STATUS,
        fromPaymentStatus: PaymentStatus.PENDING,
        toPaymentStatus: PaymentStatus.PAID,
        note: OrderHistoryNote.PAID_AFTER_CANCEL,
        changedBy: null,
      },
    ]);

    // The attempt is settled as a success and the idempotency claim is kept.
    expect(prismaServiceMock.payment.update).toHaveBeenLastCalledWith(
      expect.objectContaining({
        where: { id: PAYMENT_ID },
        data: expect.objectContaining({ status: PaymentAttemptStatus.SUCCEEDED }),
      }),
    );
    expect(prismaServiceMock.paymentEvent.delete).not.toHaveBeenCalled();
  });

  it('still confirms a live PENDING order on success, with no note', async () => {
    seedPayment(OrderStatus.PENDING, PaymentAttemptStatus.PENDING);

    await request(app.getHttpServer())
      .post(url)
      .send(successCallback())
      .expect(200, { data: { received: true } });

    expect(orderWrite()).toEqual(
      expect.objectContaining({
        status: OrderStatus.CONFIRMED,
        reservationExpiresAt: null,
      }),
    );
    expect(ledger.entries).toHaveLength(1);
    const rows = historyRows();
    expect(rows).toHaveLength(2);
    expect(rows.every((row) => row.note === undefined)).toBe(true);
    expect(rows).toContainEqual(
      expect.objectContaining({
        changeType: OrderHistoryChangeType.STATUS,
        fromStatus: OrderStatus.PENDING,
        toStatus: OrderStatus.CONFIRMED,
      }),
    );
  });
});
