import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { OrderStatus, PaymentStatus } from '@prisma/client';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { AuthRepository } from '../src/auth/auth.repository';
import { UserRepository } from '../src/user/user.repository';
import { CartRepository, CartWithItems } from '../src/cart/cart.repository';
import { OrderRepository } from '../src/order/order.repository';
import { MailService } from '../src/mail/mail.service';
import type { OrderWithItems } from '../src/order/order.types';
import { PrismaService } from '../src/prisma';

/**
 * E2E tests for the Order module.
 *
 * Order endpoints are protected by JwtAuthGuard, so every request mints a JWT
 * directly via JwtService (bypassing the rate-limited auth endpoints) and sets
 * an `Authorization: Bearer` header. OrderRepository and CartRepository — the
 * clean-architecture boundary — are mocked, so no real database is needed.
 * AuthRepository, UserRepository, and PrismaService are also mocked to let
 * AppModule bootstrap without a DB. ThrottlerGuard is overridden with a
 * pass-through guard to disable rate limiting.
 */

class ThrottlerGuardPassThrough extends ThrottlerGuard {
  protected async handleRequest(): Promise<boolean> {
    return true;
  }
}

describe('OrderController (e2e)', () => {
  let app: INestApplication;
  let jwtService: JwtService;

  const orderRepositoryMock = {
    createFromCart: jest.fn(),
    findByUserId: jest.fn(),
    findById: jest.fn(),
    updateStatus: jest.fn(),
    updatePaymentStatus: jest.fn(),
    markPaid: jest.fn(),
  };

  const cartRepositoryMock = {
    findByUserId: jest.fn(),
    findByToken: jest.fn(),
    findById: jest.fn(),
    findOrCreate: jest.fn(),
    assignCartToUser: jest.fn(),
    mergeGuestCartIntoUser: jest.fn(),
    addItem: jest.fn(),
    updateItem: jest.fn(),
    removeItem: jest.fn(),
    clearItems: jest.fn(),
    findItem: jest.fn(),
  };

  const authRepositoryMock = {
    findByEmail: jest.fn(),
    findById: jest.fn(),
    createUser: jest.fn(),
    findRefreshToken: jest.fn(),
    saveRefreshToken: jest.fn(),
    revokeToken: jest.fn(),
    revokeAllUserTokens: jest.fn(),
  };

  const userRepositoryMock = {
    findById: jest.fn(),
    findByEmail: jest.fn(),
    findAll: jest.fn(),
    update: jest.fn(),
    deactivate: jest.fn(),
    activate: jest.fn(),
  };

  // MailService is mocked so the order-confirmation dispatch in createOrder
  // never attempts a real SMTP connection during e2e.
  const mailServiceMock = {
    sendOrderConfirmation: jest.fn().mockResolvedValue(undefined),
  };

  const prismaServiceMock = {
    $connect: jest.fn(),
    $disconnect: jest.fn(),
    user: { findUnique: jest.fn(), create: jest.fn() },
    refreshToken: {
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
    },
  };

  // ─── Test data ──────────────────────────────────────────────────────────────

  const userA = { id: 'user-a-e2e-1', role: 'CUSTOMER' as const };
  const userB = { id: 'user-b-e2e-1', role: 'CUSTOMER' as const };
  const admin = { id: 'admin-e2e-1', role: 'ADMIN' as const };

  const validAddress = {
    firstName: 'Olena',
    lastName: 'Shevchenko',
    address1: 'vul. Khreshchatyk 1',
    city: 'Kyiv',
    postalCode: '01001',
    country: 'UA',
  };

  const cartItem: CartWithItems['items'][number] = {
    id: 'cart-item-e2e-1',
    productId: 'prod-e2e-1',
    variantId: 'var-e2e-1',
    quantity: 2,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    product: {
      id: 'prod-e2e-1',
      name: 'iPhone 15 Pro Case',
      price: { toString: () => '29.99' },
      compareAtPrice: null,
      isActive: true,
    },
    variant: {
      id: 'var-e2e-1',
      name: 'Black',
      price: { toString: () => '29.99' },
      stock: 50,
      isActive: true,
    },
  };

  const makeCart = (userId: string, items: CartWithItems['items'] = [cartItem]): CartWithItems => ({
    id: 'cart-e2e-1',
    userId,
    token: null,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    items,
  });

  const makeOrder = (overrides: Partial<OrderWithItems> = {}): OrderWithItems => ({
    id: 'order-e2e-1',
    userId: userA.id,
    status: OrderStatus.PENDING,
    paymentStatus: PaymentStatus.PENDING,
    subtotal: { toString: () => '59.98' },
    discount: { toString: () => '0' },
    shippingCost: { toString: () => '0' },
    tax: { toString: () => '0' },
    total: { toString: () => '59.98' },
    shippingAddress: validAddress as never,
    billingAddress: validAddress as never,
    notes: null,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    items: [
      {
        id: 'order-item-e2e-1',
        orderId: 'order-e2e-1',
        productId: 'prod-e2e-1',
        variantId: 'var-e2e-1',
        quantity: 2,
        price: { toString: () => '29.99' },
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
        product: { id: 'prod-e2e-1', name: 'iPhone 15 Pro Case', slug: 'iphone-15-pro-case' },
        variant: { id: 'var-e2e-1', name: 'Black' },
      },
    ],
    ...overrides,
  });

  function generateAccessToken(userId: string, role: string): string {
    return jwtService.sign(
      { sub: userId, role },
      { secret: process.env.JWT_SECRET, expiresIn: '15m' },
    );
  }

  function expectOrderShape(body: Record<string, unknown>): void {
    expect(body).toHaveProperty('data');
    const data = body.data as Record<string, unknown>;
    expect(data).toHaveProperty('id');
    expect(data).toHaveProperty('userId');
    expect(data).toHaveProperty('status');
    expect(data).toHaveProperty('paymentStatus');
    expect(data).toHaveProperty('total');
    expect(data).toHaveProperty('items');
  }

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
      .overrideProvider(AuthRepository)
      .useValue(authRepositoryMock)
      .overrideProvider(UserRepository)
      .useValue(userRepositoryMock)
      .overrideProvider(CartRepository)
      .useValue(cartRepositoryMock)
      .overrideProvider(OrderRepository)
      .useValue(orderRepositoryMock)
      .overrideProvider(MailService)
      .useValue(mailServiceMock)
      .overrideProvider(APP_GUARD)
      .useClass(ThrottlerGuardPassThrough)
      .compile();

    app = moduleFixture.createNestApplication();
    jwtService = moduleFixture.get<JwtService>(JwtService);

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

  afterEach(() => {
    jest.resetAllMocks();
  });

  // ─── POST /api/orders ────────────────────────────────────────────────────────

  describe('POST /api/orders', () => {
    it('should create an order from the cart and return 201', async () => {
      const token = generateAccessToken(userA.id, userA.role);
      cartRepositoryMock.findByUserId.mockResolvedValue(makeCart(userA.id));
      orderRepositoryMock.createFromCart.mockResolvedValue(makeOrder());
      userRepositoryMock.findById.mockResolvedValue({
        id: userA.id,
        email: 'usera@example.com',
        firstName: 'User',
      });

      const response = await request(app.getHttpServer())
        .post('/api/orders')
        .set('Authorization', `Bearer ${token}`)
        .send({ shippingAddress: validAddress })
        .expect(201);

      expectOrderShape(response.body);
      expect(response.body.data.status).toBe(OrderStatus.PENDING);
      expect(response.body.data.items).toHaveLength(1);
      expect(response.body.data.total).toBe('59.98');
      expect(mailServiceMock.sendOrderConfirmation).toHaveBeenCalledWith(
        expect.objectContaining({ to: 'usera@example.com' }),
      );
    });

    it('should return 401 without a JWT', async () => {
      await request(app.getHttpServer())
        .post('/api/orders')
        .send({ shippingAddress: validAddress })
        .expect(401);
    });

    it('should return 400 when shippingAddress is missing', async () => {
      const token = generateAccessToken(userA.id, userA.role);

      await request(app.getHttpServer())
        .post('/api/orders')
        .set('Authorization', `Bearer ${token}`)
        .send({ notes: 'no address' })
        .expect(400);

      expect(orderRepositoryMock.createFromCart).not.toHaveBeenCalled();
    });

    it('should return 404 when the user has no cart', async () => {
      const token = generateAccessToken(userA.id, userA.role);
      cartRepositoryMock.findByUserId.mockResolvedValue(null);

      await request(app.getHttpServer())
        .post('/api/orders')
        .set('Authorization', `Bearer ${token}`)
        .send({ shippingAddress: validAddress })
        .expect(404);
    });

    it('should return 400 when the cart is empty', async () => {
      const token = generateAccessToken(userA.id, userA.role);
      cartRepositoryMock.findByUserId.mockResolvedValue(makeCart(userA.id, []));

      await request(app.getHttpServer())
        .post('/api/orders')
        .set('Authorization', `Bearer ${token}`)
        .send({ shippingAddress: validAddress })
        .expect(400);

      expect(orderRepositoryMock.createFromCart).not.toHaveBeenCalled();
    });
  });

  // ─── GET /api/orders ─────────────────────────────────────────────────────────

  describe('GET /api/orders', () => {
    it('should return 200 with a paginated list of orders', async () => {
      const token = generateAccessToken(userA.id, userA.role);
      orderRepositoryMock.findByUserId.mockResolvedValue({ orders: [makeOrder()], total: 1 });

      const response = await request(app.getHttpServer())
        .get('/api/orders')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(response.body.data).toHaveLength(1);
      expect(response.body.meta).toEqual({ total: 1, page: 1, limit: 10, totalPages: 1 });
    });

    it('should pass the status filter to the repository', async () => {
      const token = generateAccessToken(userA.id, userA.role);
      orderRepositoryMock.findByUserId.mockResolvedValue({ orders: [], total: 0 });

      await request(app.getHttpServer())
        .get('/api/orders?status=PENDING')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(orderRepositoryMock.findByUserId).toHaveBeenCalledWith(
        userA.id,
        expect.objectContaining({ status: OrderStatus.PENDING }),
      );
    });

    it('should return 401 without a JWT', async () => {
      await request(app.getHttpServer()).get('/api/orders').expect(401);
    });
  });

  // ─── GET /api/orders/:orderId ──────────────────────────────────────────────────

  describe('GET /api/orders/:orderId', () => {
    it('should return 200 for an order owned by the user', async () => {
      const token = generateAccessToken(userA.id, userA.role);
      orderRepositoryMock.findById.mockResolvedValue(makeOrder());

      const response = await request(app.getHttpServer())
        .get('/api/orders/order-e2e-1')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expectOrderShape(response.body);
      expect(response.body.data.id).toBe('order-e2e-1');
    });

    it('should return 404 when the order belongs to another user (IDOR)', async () => {
      const token = generateAccessToken(userB.id, userB.role);
      orderRepositoryMock.findById.mockResolvedValue(makeOrder({ userId: userA.id }));

      await request(app.getHttpServer())
        .get('/api/orders/order-e2e-1')
        .set('Authorization', `Bearer ${token}`)
        .expect(404);
    });

    it('should return 404 when the order does not exist', async () => {
      const token = generateAccessToken(userA.id, userA.role);
      orderRepositoryMock.findById.mockResolvedValue(null);

      await request(app.getHttpServer())
        .get('/api/orders/nonexistent-uuid')
        .set('Authorization', `Bearer ${token}`)
        .expect(404);
    });

    it('should return 401 without a JWT', async () => {
      await request(app.getHttpServer()).get('/api/orders/order-e2e-1').expect(401);
    });
  });

  // ─── PATCH /api/orders/:orderId/cancel ──────────────────────────────────────────

  describe('PATCH /api/orders/:orderId/cancel', () => {
    it('should cancel a PENDING order and return 200', async () => {
      const token = generateAccessToken(userA.id, userA.role);
      orderRepositoryMock.findById.mockResolvedValue(makeOrder({ status: OrderStatus.PENDING }));
      orderRepositoryMock.updateStatus.mockResolvedValue(
        makeOrder({ status: OrderStatus.CANCELLED }),
      );

      const response = await request(app.getHttpServer())
        .patch('/api/orders/order-e2e-1/cancel')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(response.body.data.status).toBe(OrderStatus.CANCELLED);
      expect(orderRepositoryMock.updateStatus).toHaveBeenCalledWith(
        'order-e2e-1',
        OrderStatus.CANCELLED,
      );
    });

    it('should return 409 when cancelling a CONFIRMED order', async () => {
      const token = generateAccessToken(userA.id, userA.role);
      orderRepositoryMock.findById.mockResolvedValue(makeOrder({ status: OrderStatus.CONFIRMED }));

      await request(app.getHttpServer())
        .patch('/api/orders/order-e2e-1/cancel')
        .set('Authorization', `Bearer ${token}`)
        .expect(409);

      expect(orderRepositoryMock.updateStatus).not.toHaveBeenCalled();
    });

    it('should return 404 when the order does not exist', async () => {
      const token = generateAccessToken(userA.id, userA.role);
      orderRepositoryMock.findById.mockResolvedValue(null);

      await request(app.getHttpServer())
        .patch('/api/orders/nonexistent-uuid/cancel')
        .set('Authorization', `Bearer ${token}`)
        .expect(404);
    });

    it('should return 401 without a JWT', async () => {
      await request(app.getHttpServer()).patch('/api/orders/order-e2e-1/cancel').expect(401);
    });
  });

  // ─── PATCH /api/orders/:orderId/confirm-payment (admin) ─────────────────────────

  describe('PATCH /api/orders/:orderId/confirm-payment', () => {
    it('should mark a PENDING order paid and confirmed for an admin (200)', async () => {
      const token = generateAccessToken(admin.id, admin.role);
      orderRepositoryMock.findById.mockResolvedValue(makeOrder({ status: OrderStatus.PENDING }));
      orderRepositoryMock.markPaid.mockResolvedValue(
        makeOrder({ status: OrderStatus.CONFIRMED, paymentStatus: PaymentStatus.PAID }),
      );

      const response = await request(app.getHttpServer())
        .patch('/api/orders/order-e2e-1/confirm-payment')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(response.body.data.status).toBe(OrderStatus.CONFIRMED);
      expect(response.body.data.paymentStatus).toBe(PaymentStatus.PAID);
      expect(orderRepositoryMock.markPaid).toHaveBeenCalledWith('order-e2e-1');
    });

    it('should return 403 for a non-admin user', async () => {
      const token = generateAccessToken(userA.id, userA.role);

      await request(app.getHttpServer())
        .patch('/api/orders/order-e2e-1/confirm-payment')
        .set('Authorization', `Bearer ${token}`)
        .expect(403);

      expect(orderRepositoryMock.markPaid).not.toHaveBeenCalled();
    });

    it('should return 409 when the order is not PENDING', async () => {
      const token = generateAccessToken(admin.id, admin.role);
      orderRepositoryMock.findById.mockResolvedValue(makeOrder({ status: OrderStatus.CONFIRMED }));

      await request(app.getHttpServer())
        .patch('/api/orders/order-e2e-1/confirm-payment')
        .set('Authorization', `Bearer ${token}`)
        .expect(409);

      expect(orderRepositoryMock.markPaid).not.toHaveBeenCalled();
    });

    it('should return 404 when the order does not exist', async () => {
      const token = generateAccessToken(admin.id, admin.role);
      orderRepositoryMock.findById.mockResolvedValue(null);

      await request(app.getHttpServer())
        .patch('/api/orders/nonexistent-uuid/confirm-payment')
        .set('Authorization', `Bearer ${token}`)
        .expect(404);
    });

    it('should return 401 without a JWT', async () => {
      await request(app.getHttpServer())
        .patch('/api/orders/order-e2e-1/confirm-payment')
        .expect(401);
    });
  });
});
