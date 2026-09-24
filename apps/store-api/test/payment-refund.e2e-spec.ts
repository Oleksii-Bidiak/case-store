import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';
import {
  OrderStatus,
  PaymentAttemptStatus,
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
import { createPermissionRepositoryMock } from './permission-repository.mock';

/**
 * E2E: a LiqPay `reversed` callback, partial vs full (TASK-618).
 *
 * The whole chain runs for real — signature verification in the LiqPay adapter,
 * PaymentService (money check, idempotency claim, partial/full decision),
 * OrderService (second money check, the payment state machine) and both
 * repositories. Only `PrismaService` is a double, so the assertions are on what
 * would have been WRITTEN.
 *
 * Before TASK-618 the partial case answered 400: PaymentService let a smaller
 * refund through, OrderService demanded the full amount, and the money LiqPay
 * had already sent back was never recorded while LiqPay retried the callback.
 */

class ThrottlerGuardPassThrough extends ThrottlerGuard {
  protected async handleRequest(): Promise<boolean> {
    return true;
  }
}

const PAYMENT_ID = '550e8400-e29b-41d4-a716-446655440618';
const ORDER_ID = '550e8400-e29b-41d4-a716-4466554406ff';
const CHARGED = '1249.00';

describe('LiqPay reversed callback — partial vs full refund (e2e, TASK-618)', () => {
  let app: INestApplication;
  let privateKey: string;

  const prismaServiceMock = {
    $connect: jest.fn(),
    $disconnect: jest.fn(),
    $on: jest.fn(),
    payment: { findUnique: jest.fn(), update: jest.fn() },
    paymentEvent: { create: jest.fn(), delete: jest.fn() },
    order: { update: jest.fn(), findUniqueOrThrow: jest.fn() },
    orderStatusHistory: { create: jest.fn() },
    $transaction: jest.fn(),
  };

  /**
   * One row serves both reads: PaymentRepository.findById (the whole Payment)
   * and OrderRepository.findPaymentWithOrder (a select that nests the order).
   */
  const seedPayment = (orderStatus: OrderStatus, paymentStatus: PaymentStatus) => {
    const row: Payment & { order: Record<string, unknown> } = {
      id: PAYMENT_ID,
      orderId: ORDER_ID,
      provider: 'liqpay',
      providerPaymentId: '777',
      amount: new Prisma.Decimal(CHARGED),
      currency: 'UAH',
      status: PaymentAttemptStatus.SUCCEEDED,
      failureCode: null,
      failureMessage: null,
      settledAt: new Date('2026-09-20T10:00:00.000Z'),
      createdAt: new Date('2026-09-20T09:55:00.000Z'),
      updatedAt: new Date('2026-09-20T10:00:00.000Z'),
      order: {
        id: ORDER_ID,
        status: orderStatus,
        paymentStatus,
        paidAt: new Date('2026-09-20T10:00:00.000Z'),
        reservationExpiresAt: null,
      },
    } as Payment & { order: Record<string, unknown> };
    prismaServiceMock.payment.findUnique.mockResolvedValue(row);
  };

  /** A signed LiqPay callback body, exactly as LiqPay would POST it. */
  const reversedCallback = (amount: string) => {
    const data = Buffer.from(
      JSON.stringify({
        order_id: PAYMENT_ID,
        status: 'reversed',
        payment_id: 777,
        amount,
        currency: 'UAH',
      }),
    ).toString('base64');
    return { data, signature: signLiqPayData(data, privateKey) };
  };

  /** The `data` of the single order.update the transaction made. */
  const orderWrite = () =>
    (prismaServiceMock.order.update.mock.calls[0][0] as { data: Record<string, unknown> }).data;

  /** The `status` the attempt row was last written with. */
  const lastAttemptStatus = () =>
    (
      prismaServiceMock.payment.update.mock.calls.at(-1)?.[0] as {
        data: { status: PaymentAttemptStatus };
      }
    ).data.status;

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
    prismaServiceMock.paymentEvent.create.mockResolvedValue({ id: 'evt-618' });
    prismaServiceMock.payment.update.mockResolvedValue({});
    prismaServiceMock.order.update.mockResolvedValue({});
    prismaServiceMock.order.findUniqueOrThrow.mockResolvedValue({ id: ORDER_ID });
    prismaServiceMock.orderStatusHistory.create.mockResolvedValue({});
    prismaServiceMock.$transaction.mockImplementation(
      (fn: (tx: typeof prismaServiceMock) => unknown) => fn(prismaServiceMock),
    );
  });

  const url = '/api/payments/liqpay/callback';

  it('records a PARTIAL reversal as PARTIALLY_REFUNDED and leaves a DELIVERED order DELIVERED', async () => {
    seedPayment(OrderStatus.DELIVERED, PaymentStatus.PAID);

    await request(app.getHttpServer())
      .post(url)
      .send(reversedCallback('200.00'))
      .expect(200, { data: { received: true } });

    expect(orderWrite()).toEqual({ paymentStatus: PaymentStatus.PARTIALLY_REFUNDED });
    expect(prismaServiceMock.orderStatusHistory.create).toHaveBeenCalledTimes(1);
    expect(prismaServiceMock.orderStatusHistory.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        fromPaymentStatus: PaymentStatus.PAID,
        toPaymentStatus: PaymentStatus.PARTIALLY_REFUNDED,
        changedBy: null,
      }),
    });
    // The attempt keeps SUCCEEDED — the rest of the money may still be refunded.
    expect(lastAttemptStatus()).toBe(PaymentAttemptStatus.SUCCEEDED);
    // The idempotency claim was kept, not released.
    expect(prismaServiceMock.paymentEvent.delete).not.toHaveBeenCalled();
  });

  it('records a FULL reversal as REFUNDED and moves the DELIVERED order to REFUNDED', async () => {
    seedPayment(OrderStatus.DELIVERED, PaymentStatus.PAID);

    await request(app.getHttpServer())
      .post(url)
      .send(reversedCallback(CHARGED))
      .expect(200, { data: { received: true } });

    expect(orderWrite()).toEqual({
      paymentStatus: PaymentStatus.REFUNDED,
      status: OrderStatus.REFUNDED,
    });
    expect(lastAttemptStatus()).toBe(PaymentAttemptStatus.REFUNDED);
    expect(prismaServiceMock.paymentEvent.delete).not.toHaveBeenCalled();
  });

  it('still refuses a reversal larger than the charge, before recording it', async () => {
    seedPayment(OrderStatus.DELIVERED, PaymentStatus.PAID);

    await request(app.getHttpServer()).post(url).send(reversedCallback('5000.00')).expect(400);

    expect(prismaServiceMock.paymentEvent.create).not.toHaveBeenCalled();
    expect(prismaServiceMock.order.update).not.toHaveBeenCalled();
  });
});
