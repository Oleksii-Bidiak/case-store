import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule, ThrottlerStorage } from '@nestjs/throttler';
import { JwtService } from '@nestjs/jwt';
import { OrderStatus, PaymentMethod, PaymentStatus, UserRole } from '@prisma/client';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { AuthRepository } from '../src/auth/auth.repository';
import { UserRepository } from '../src/user/user.repository';
import { OrderRepository } from '../src/order/order.repository';
import { PrismaService } from '../src/prisma';
import { PermissionRepository } from '../src/auth/permissions';
import { createPermissionRepositoryMock } from './permission-repository.mock';

/**
 * TASK-620 (decision B-11 №7): correcting an operator's mistaken «Кошти
 * повернено». REFUNDED stays terminal for facts; this door lifts only an
 * OPERATOR's mark, under its own key, with a reason, and leaves an action-log
 * row. OrderRepository is the double (the clean-architecture boundary); the
 * action log is observed where it lands — `PrismaService.auditLog.create`.
 */
describe('POST /api/admin/orders/:orderId/payment-correction (e2e)', () => {
  let app: INestApplication;
  let jwtService: JwtService;

  const ORDER_ID = 'order-e2e-620';
  const url = `/api/admin/orders/${ORDER_ID}/payment-correction`;

  const admin = { id: 'admin-e2e-620', role: UserRole.ADMIN };
  // A manager who may do everything to an order's money EXCEPT this correction.
  const manager = { id: 'manager-e2e-620', role: UserRole.MANAGER };

  const orderRepositoryMock = {
    findById: jest.fn(),
    findLastPaymentMark: jest.fn(),
    updatePaymentStatus: jest.fn(),
  };

  const prismaServiceMock = {
    $connect: jest.fn(),
    $disconnect: jest.fn(),
    $queryRaw: jest.fn().mockResolvedValue([]),
    user: { findUnique: jest.fn() },
    refreshToken: { findUnique: jest.fn() },
    auditLog: { create: jest.fn() },
  };

  const makeOrder = (paymentStatus: PaymentStatus) => ({
    id: ORDER_ID,
    userId: null,
    status: OrderStatus.CANCELLED,
    paymentStatus,
    paymentMethod: PaymentMethod.ONLINE,
    subtotal: { toString: () => '100.00' },
    discount: { toString: () => '0' },
    shippingCost: { toString: () => '0' },
    addonsTotal: { toString: () => '0' },
    tax: { toString: () => '0' },
    total: { toString: () => '100.00' },
    shippingAddress: null,
    billingAddress: null,
    notes: null,
    createdAt: new Date('2026-09-01T10:00:00.000Z'),
    updatedAt: new Date('2026-09-01T10:00:00.000Z'),
    restockedAt: null,
    items: [],
  });

  const token = (user: { id: string; role: string }) =>
    `Bearer ${jwtService.sign(
      { sub: user.id, role: user.role },
      { secret: process.env.JWT_SECRET, expiresIn: '15m' },
    )}`;

  const settle = () => new Promise((resolve) => setImmediate(resolve));

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
          grants: {
            MANAGER: ['orders:read', 'orders:write', 'payments:read', 'payments:refund'],
          },
        }),
      )
      .overrideProvider(AuthRepository)
      .useValue({ findById: jest.fn(), findByEmail: jest.fn() })
      .overrideProvider(UserRepository)
      .useValue({ findById: jest.fn(), findByEmail: jest.fn() })
      .overrideProvider(OrderRepository)
      .useValue(orderRepositoryMock)
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
    orderRepositoryMock.findById.mockResolvedValue(makeOrder(PaymentStatus.REFUNDED));
  });

  it('403 for a manager holding every other order and payment key', async () => {
    await request(app.getHttpServer())
      .post(url)
      .set('Authorization', token(manager))
      .send({ paymentStatus: 'PAID', reason: 'Помилково натиснув' })
      .expect(403);

    expect(orderRepositoryMock.updatePaymentStatus).not.toHaveBeenCalled();
  });

  it('400 without a reason — nothing written', async () => {
    await request(app.getHttpServer())
      .post(url)
      .set('Authorization', token(admin))
      .send({ paymentStatus: 'PAID' })
      .expect(400);

    await request(app.getHttpServer())
      .post(url)
      .set('Authorization', token(admin))
      .send({ paymentStatus: 'PAID', reason: '   ' })
      .expect(400);

    expect(orderRepositoryMock.updatePaymentStatus).not.toHaveBeenCalled();
  });

  it('400 for a target other than PAID / PARTIALLY_REFUNDED', async () => {
    await request(app.getHttpServer())
      .post(url)
      .set('Authorization', token(admin))
      .send({ paymentStatus: 'PENDING', reason: 'причина' })
      .expect(400);
  });

  it('409 for a REFUNDED the provider reported — nothing written', async () => {
    orderRepositoryMock.findLastPaymentMark.mockResolvedValue({ changedBy: null });

    const res = await request(app.getHttpServer())
      .post(url)
      .set('Authorization', token(admin))
      .send({ paymentStatus: 'PAID', reason: 'Клієнт каже, що гроші не повернулись' })
      .expect(409);

    expect(res.body.error).toBe('ORDER_PAYMENT_CORRECTION_PROVIDER_REFUND');
    expect(orderRepositoryMock.updatePaymentStatus).not.toHaveBeenCalled();
  });

  it('200 for an operator-set REFUNDED with a reason, and an action-log row with the reason', async () => {
    orderRepositoryMock.findLastPaymentMark.mockResolvedValue({ changedBy: 'admin-e2e-other' });
    orderRepositoryMock.updatePaymentStatus.mockResolvedValue(makeOrder(PaymentStatus.PAID));

    const res = await request(app.getHttpServer())
      .post(url)
      .set('Authorization', token(admin))
      .send({ paymentStatus: 'PAID', reason: 'Помилково натиснув «Кошти повернено»' })
      .expect(200);

    expect(res.body.data.paymentStatus).toBe(PaymentStatus.PAID);
    expect(orderRepositoryMock.updatePaymentStatus).toHaveBeenCalledWith(
      ORDER_ID,
      PaymentStatus.PAID,
      admin.id,
      { expectedFrom: PaymentStatus.REFUNDED },
    );

    await settle();
    expect(prismaServiceMock.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: 'order.correctPaymentStatus',
        entityType: 'order',
        entityId: ORDER_ID,
        actorId: admin.id,
        diff: expect.objectContaining({
          reason: { to: 'Помилково натиснув «Кошти повернено»' },
          paymentStatus: { to: 'PAID' },
        }),
      }),
    });
  });
});
