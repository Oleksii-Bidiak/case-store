import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule, ThrottlerStorage } from '@nestjs/throttler';
import { JwtService } from '@nestjs/jwt';
import { PaymentAttemptStatus, Prisma, UserRole, type Payment } from '@prisma/client';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { AuthRepository } from '../src/auth/auth.repository';
import { UserRepository } from '../src/user/user.repository';
import { PermissionRepository } from '../src/auth/permissions';
import { LiqPayAdapter } from '../src/payment/adapters/liqpay/liqpay.adapter';
import { PrismaService } from '../src/prisma';
import { createPermissionRepositoryMock } from './permission-repository.mock';

/**
 * E2E: the admin payment card's two doors (TASK-371) —
 * `GET /api/admin/payments/orders/:orderId` and
 * `POST /api/admin/payments/:paymentId/refund`.
 *
 * The real guard, validation pipe, controller and `PaymentService` run; only
 * `PrismaService` and the LiqPay adapter are doubles, so no request ever leaves
 * for LiqPay and the assertions are on what the adapter was ASKED to refund.
 *
 * The contract the admin dialog is written against: 202 means *requested* (the
 * payment changes only on the provider's callback), 403 without
 * `payments:refund`, 409 when the attempt is not SUCCEEDED, 400 for an amount
 * over what is left after earlier refunds (TASK-1302), for zero, or for one that
 * is not a two-decimal string, 404 for an unknown attempt.
 */
describe('Admin payments — attempt list and refund (e2e, TASK-371)', () => {
  let app: INestApplication;
  let jwtService: JwtService;

  const ORDER_ID = 'order-e2e-371';
  const PAYMENT_ID = 'payment-e2e-371';
  const CHARGED = '1299.00';
  // How a Prisma Decimal serialises it — no trailing zeros.
  const CHARGED_WIRE = new Prisma.Decimal(CHARGED).toString();

  const admin = { id: 'admin-e2e-371', role: UserRole.ADMIN };
  // Reads the card, cannot move money.
  const reader = { id: 'manager-reader-e2e-371', role: UserRole.MANAGER };

  const liqPayMock = {
    refund: jest.fn(),
    isSandbox: jest.fn().mockReturnValue(true),
  };

  const prismaServiceMock = {
    $connect: jest.fn(),
    $disconnect: jest.fn(),
    $queryRaw: jest.fn().mockResolvedValue([]),
    // PaymentRepository.reserveRefund / releaseRefund — 1 row = the reservation fit.
    $executeRaw: jest.fn().mockResolvedValue(1),
    user: { findUnique: jest.fn() },
    refreshToken: { findUnique: jest.fn() },
    auditLog: { create: jest.fn() },
    payment: { findUnique: jest.fn(), findMany: jest.fn() },
  };

  const makePayment = (overrides: Partial<Payment> = {}): Payment => ({
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
    settledAt: new Date('2026-09-26T10:05:00.000Z'),
    createdAt: new Date('2026-09-26T10:00:00.000Z'),
    updatedAt: new Date('2026-09-26T10:05:00.000Z'),
    ...overrides,
  });

  const token = (user: { id: string; role: string }) =>
    `Bearer ${jwtService.sign(
      { sub: user.id, role: user.role },
      { secret: process.env.JWT_SECRET, expiresIn: '15m' },
    )}`;

  const refundUrl = `/api/admin/payments/${PAYMENT_ID}/refund`;

  beforeAll(async () => {
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
      .useValue(
        createPermissionRepositoryMock({
          grants: { MANAGER: ['orders:read', 'payments:read'] },
        }),
      )
      .overrideProvider(AuthRepository)
      .useValue({ findById: jest.fn(), findByEmail: jest.fn() })
      .overrideProvider(UserRepository)
      .useValue({ findById: jest.fn(), findByEmail: jest.fn() })
      .overrideProvider(LiqPayAdapter)
      .useValue(liqPayMock)
      .overrideProvider(ThrottlerStorage)
      .useValue({
        increment: async () => ({
          totalHits: 1,
          timeToExpire: 60,
          isBlocked: false,
          timeToBlockExpire: 0,
        }),
      })
      .compile();

    app = moduleFixture.createNestApplication();
    jwtService = moduleFixture.get(JwtService);
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
    liqPayMock.refund.mockResolvedValue(undefined);
    prismaServiceMock.payment.findUnique.mockResolvedValue(makePayment());
    prismaServiceMock.$executeRaw.mockResolvedValue(1);
  });

  describe('GET /api/admin/payments/orders/:orderId', () => {
    it('lists the attempts newest first for a payments:read holder', async () => {
      prismaServiceMock.payment.findMany.mockResolvedValue([
        makePayment(),
        makePayment({
          id: 'payment-e2e-371-old',
          status: PaymentAttemptStatus.FAILED,
          failureCode: '4159',
          failureMessage: 'Card declined',
          createdAt: new Date('2026-09-26T09:55:00.000Z'),
        }),
      ]);

      const res = await request(app.getHttpServer())
        .get(`/api/admin/payments/orders/${ORDER_ID}`)
        .set('Authorization', token(reader))
        .expect(200);

      expect(prismaServiceMock.payment.findMany).toHaveBeenCalledWith({
        where: { orderId: ORDER_ID },
        orderBy: { createdAt: 'desc' },
      });
      expect(res.body.data).toHaveLength(2);
      expect(res.body.data[0]).toMatchObject({
        id: PAYMENT_ID,
        amount: CHARGED_WIRE,
        refundedAmount: '0',
        status: 'SUCCEEDED',
        providerPaymentId: '777',
      });
      expect(res.body.data[1]).toMatchObject({ status: 'FAILED', failureCode: '4159' });
    });
  });

  describe('POST /api/admin/payments/:paymentId/refund', () => {
    it('202 for a partial amount — requested of LiqPay, nothing written', async () => {
      await request(app.getHttpServer())
        .post(refundUrl)
        .set('Authorization', token(admin))
        .send({ amount: '499.50' })
        .expect(202, { data: { accepted: true } });

      expect(liqPayMock.refund).toHaveBeenCalledTimes(1);
      expect(liqPayMock.refund).toHaveBeenCalledWith({ paymentId: PAYMENT_ID, amount: '499.50' });
    });

    it('202 for the whole attempt when the amount is omitted', async () => {
      await request(app.getHttpServer())
        .post(refundUrl)
        .set('Authorization', token(admin))
        .send({})
        .expect(202);

      expect(liqPayMock.refund).toHaveBeenCalledWith({
        paymentId: PAYMENT_ID,
        amount: CHARGED_WIRE,
      });
    });

    it('403 for a session that may read the card but not refund', async () => {
      await request(app.getHttpServer())
        .post(refundUrl)
        .set('Authorization', token(reader))
        .send({ amount: '100.00' })
        .expect(403);

      expect(liqPayMock.refund).not.toHaveBeenCalled();
    });

    it('409 when the attempt is not SUCCEEDED', async () => {
      prismaServiceMock.payment.findUnique.mockResolvedValue(
        makePayment({ status: PaymentAttemptStatus.REFUNDED }),
      );

      await request(app.getHttpServer())
        .post(refundUrl)
        .set('Authorization', token(admin))
        .send({ amount: '100.00' })
        .expect(409);

      expect(liqPayMock.refund).not.toHaveBeenCalled();
    });

    it('400 when the amount exceeds what the attempt charged', async () => {
      await request(app.getHttpServer())
        .post(refundUrl)
        .set('Authorization', token(admin))
        .send({ amount: '1299.01' })
        .expect(400);

      expect(liqPayMock.refund).not.toHaveBeenCalled();
    });

    it('400 for an amount that is not a two-decimal string', async () => {
      await request(app.getHttpServer())
        .post(refundUrl)
        .set('Authorization', token(admin))
        .send({ amount: '12.345' })
        .expect(400);

      expect(liqPayMock.refund).not.toHaveBeenCalled();
    });

    it('400 with a stable code for more than is left after an earlier partial refund', async () => {
      prismaServiceMock.payment.findUnique.mockResolvedValue(
        makePayment({ refundedAmount: new Prisma.Decimal('800.00') }),
      );

      const res = await request(app.getHttpServer())
        .post(refundUrl)
        .set('Authorization', token(admin))
        .send({ amount: '500.00' })
        .expect(400);

      expect(res.body.error).toBe('PAYMENT_REFUND_EXCEEDS_BALANCE');
      expect(prismaServiceMock.$executeRaw).not.toHaveBeenCalled();
      expect(liqPayMock.refund).not.toHaveBeenCalled();
    });

    it('refunds only the remainder when the amount is omitted after a partial refund', async () => {
      prismaServiceMock.payment.findUnique.mockResolvedValue(
        makePayment({ refundedAmount: new Prisma.Decimal('800.00') }),
      );

      await request(app.getHttpServer())
        .post(refundUrl)
        .set('Authorization', token(admin))
        .send({})
        .expect(202);

      expect(liqPayMock.refund).toHaveBeenCalledWith({ paymentId: PAYMENT_ID, amount: '499' });
    });

    it('400 when a simultaneous refund reserved the balance first', async () => {
      prismaServiceMock.payment.findUnique
        .mockResolvedValueOnce(makePayment())
        .mockResolvedValueOnce(makePayment({ refundedAmount: new Prisma.Decimal('1000.00') }));
      prismaServiceMock.$executeRaw.mockResolvedValue(0);

      const res = await request(app.getHttpServer())
        .post(refundUrl)
        .set('Authorization', token(admin))
        .send({ amount: '500.00' })
        .expect(400);

      expect(res.body.error).toBe('PAYMENT_REFUND_EXCEEDS_BALANCE');
      expect(liqPayMock.refund).not.toHaveBeenCalled();
    });

    it('400 for a refund of zero', async () => {
      for (const amount of ['0', '0.00']) {
        await request(app.getHttpServer())
          .post(refundUrl)
          .set('Authorization', token(admin))
          .send({ amount })
          .expect(400);
      }

      expect(liqPayMock.refund).not.toHaveBeenCalled();
    });

    it('404 for an unknown attempt', async () => {
      prismaServiceMock.payment.findUnique.mockResolvedValue(null);

      await request(app.getHttpServer())
        .post(refundUrl)
        .set('Authorization', token(admin))
        .send({})
        .expect(404);
    });
  });
});
