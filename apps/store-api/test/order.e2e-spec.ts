import { Test, TestingModule } from '@nestjs/testing';
import { ConflictException, INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { OrderStatus, PaymentStatus, OrderHistoryChangeType, Prisma } from '@prisma/client';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { AuthRepository } from '../src/auth/auth.repository';
import { UserRepository } from '../src/user/user.repository';
import { CartRepository, CartWithItems } from '../src/cart/cart.repository';
import { OrderRepository } from '../src/order/order.repository';
import { DiscountRepository } from '../src/discount';
import { MailService } from '../src/mail/mail.service';
import { MailOutboxService } from '../src/mail-outbox';
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
    findAll: jest.fn(),
    findById: jest.fn(),
    findByIdForAdmin: jest.fn(),
    updateStatus: jest.fn(),
    cancelAndRestock: jest.fn(),
    reviveAndReserve: jest.fn(),
    updatePaymentStatus: jest.fn(),
    findHistoryByOrderId: jest.fn(),
  };

  // TASK-079: DiscountRepository is mocked so the order-with-discount path can
  // recompute a code without a real DB. createFromCart itself is mocked, so the
  // redeem closure is not invoked here (the redeem-in-transaction path is
  // covered by the order.service unit spec + the integration runner).
  const discountRepositoryMock = {
    findByCode: jest.fn(),
    findById: jest.fn(),
    findMany: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    softDeactivate: jest.fn(),
    countUserRedemptions: jest.fn(),
    incrementRedeemed: jest.fn(),
    createRedemption: jest.fn(),
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

  // MailService is mocked so nothing ever attempts a real SMTP connection.
  const mailServiceMock = {
    sendOrderConfirmation: jest.fn().mockResolvedValue(undefined),
    sendOrderConfirmationPayload: jest.fn().mockResolvedValue(undefined),
    isEnabled: jest.fn().mockReturnValue(false),
  };

  // TASK-103-F: order creation enqueues the confirmation email into the mail
  // outbox (inside the order transaction) instead of sending synchronously.
  // Mock the outbox service so the assertion targets the enqueue, and stub
  // dispatchDue so a stray worker tick is a harmless no-op.
  const mailOutboxServiceMock = {
    enqueueOrderConfirmation: jest.fn().mockResolvedValue(undefined),
    dispatchDue: jest.fn().mockResolvedValue({ sent: 0, retried: 0, failed: 0 }),
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
    phone: '+380501234567',
    address1: 'Нова Пошта, відділення №12',
    city: 'Kyiv',
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
      // Match the CartWithItems contract: CART_ITEMS_INCLUDE always selects
      // product.images, so the cart fixture must carry it too.
      images: [],
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

  // Primary-image URL the order line should surface — mirrors the `images`
  // relation that `ORDERS_INCLUDE` always selects (isPrimary-first, take: 1).
  const ORDER_ITEM_IMAGE_URL = 'https://cdn.example.com/iphone-15-pro-case.jpg';

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
    restockedAt: null,
    items: [
      {
        id: 'order-item-e2e-1',
        orderId: 'order-e2e-1',
        productId: 'prod-e2e-1',
        variantId: 'var-e2e-1',
        quantity: 2,
        price: { toString: () => '29.99' },
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
        product: {
          id: 'prod-e2e-1',
          name: 'iPhone 15 Pro Case',
          slug: 'iphone-15-pro-case',
          images: [{ url: ORDER_ITEM_IMAGE_URL }],
        },
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
    // Each line surfaces the product's primary image for the order-detail thumbnail.
    const items = data.items as Array<Record<string, unknown>>;
    expect(items[0]).toHaveProperty('imageUrl', ORDER_ITEM_IMAGE_URL);
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
      .overrideProvider(DiscountRepository)
      .useValue(discountRepositoryMock)
      .overrideProvider(MailService)
      .useValue(mailServiceMock)
      .overrideProvider(MailOutboxService)
      .useValue(mailOutboxServiceMock)
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
    // The order ban guard (TASK-150) fetches the placing user first; seed an
    // active account by default so the cart/validation paths are reachable.
    // Tests that exercise the ban itself override this.
    beforeEach(() => {
      userRepositoryMock.findById.mockResolvedValue({
        id: userA.id,
        email: 'usera@example.com',
        firstName: 'User',
        isActive: true,
      });
    });

    it('should create an order from the cart and return 201', async () => {
      const token = generateAccessToken(userA.id, userA.role);
      cartRepositoryMock.findByUserId.mockResolvedValue(makeCart(userA.id));
      // Drive the in-transaction afterCreate hook so the outbox enqueue runs,
      // mirroring the real repository (TASK-103-F).
      const createdOrder = makeOrder();
      const txStub = { mailOutbox: { create: jest.fn() } };
      orderRepositoryMock.createFromCart.mockImplementation(
        async (
          _params: unknown,
          afterCreate?: (tx: unknown, created: OrderWithItems) => Promise<void>,
        ) => {
          if (afterCreate) await afterCreate(txStub, createdOrder);
          return createdOrder;
        },
      );

      const response = await request(app.getHttpServer())
        .post('/api/orders')
        .set('Authorization', `Bearer ${token}`)
        .send({ shippingAddress: validAddress })
        .expect(201);

      expectOrderShape(response.body);
      expect(response.body.data.status).toBe(OrderStatus.PENDING);
      expect(response.body.data.items).toHaveLength(1);
      expect(response.body.data.total).toBe('59.98');
      // The confirmation email is enqueued into the outbox (in-transaction),
      // NOT sent synchronously over SMTP.
      expect(mailOutboxServiceMock.enqueueOrderConfirmation).toHaveBeenCalledWith(
        expect.objectContaining({ to: 'usera@example.com' }),
        txStub,
      );
      expect(mailServiceMock.sendOrderConfirmation).not.toHaveBeenCalled();
    });

    // TASK-229: `country` is optional in the payload but must be snapshotted —
    // the ValidationPipe (transform: true) applies the DTO's server-side 'UA'
    // default, so the mail renderer always has a country to print.
    it('defaults the shipping-address country to UA when omitted (201)', async () => {
      const token = generateAccessToken(userA.id, userA.role);
      cartRepositoryMock.findByUserId.mockResolvedValue(makeCart(userA.id));
      orderRepositoryMock.createFromCart.mockResolvedValue(makeOrder());

      const minimalAddress = {
        firstName: 'Проба',
        lastName: '229',
        phone: '+380501234567',
        address1: 'вул. Тестова, 1',
        city: 'Київ',
      };

      await request(app.getHttpServer())
        .post('/api/orders')
        .set('Authorization', `Bearer ${token}`)
        .send({ shippingAddress: minimalAddress })
        .expect(201);

      expect(orderRepositoryMock.createFromCart).toHaveBeenCalledWith(
        expect.objectContaining({
          shippingAddress: expect.objectContaining({ country: 'UA' }),
        }),
        expect.any(Function),
      );
    });

    it('recomputes and applies a promo code at checkout (TASK-079)', async () => {
      const token = generateAccessToken(userA.id, userA.role);
      cartRepositoryMock.findByUserId.mockResolvedValue(makeCart(userA.id));
      // Subtotal is 59.98 (29.99 × 2); a 10% PERCENT code discounts 6.00.
      discountRepositoryMock.findByCode.mockResolvedValue({
        id: 'd-e2e-1',
        code: 'SUMMER10',
        type: 'PERCENT',
        value: new Prisma.Decimal('10'),
        minSpend: null,
        maxRedemptions: null,
        redeemedCount: 0,
        perUserLimit: null,
        startsAt: null,
        expiresAt: null,
        isActive: true,
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
        updatedAt: new Date('2026-01-01T00:00:00.000Z'),
      });
      orderRepositoryMock.createFromCart.mockResolvedValue(
        makeOrder({
          discount: { toString: () => '6.00' },
          discountCode: 'SUMMER10',
          total: { toString: () => '53.98' },
        }),
      );

      const response = await request(app.getHttpServer())
        .post('/api/orders')
        .set('Authorization', `Bearer ${token}`)
        .send({ shippingAddress: validAddress, discountCode: 'summer10' })
        .expect(201);

      expect(discountRepositoryMock.findByCode).toHaveBeenCalledWith('SUMMER10');
      // The recomputed discount (amount + code) is forwarded into the order tx.
      expect(orderRepositoryMock.createFromCart).toHaveBeenCalledWith(
        expect.objectContaining({
          discount: expect.objectContaining({ amount: '6.00', code: 'SUMMER10' }),
        }),
        // TASK-103: createFromCart also receives the in-transaction afterCreate
        // callback (mail-outbox enqueue) as a second argument.
        expect.any(Function),
      );
      expect(response.body.data.discountCode).toBe('SUMMER10');
      expect(response.body.data.discount).toBe('6.00');
      expect(response.body.data.total).toBe('53.98');
    });

    it('should return 401 without a JWT', async () => {
      await request(app.getHttpServer())
        .post('/api/orders')
        .send({ shippingAddress: validAddress })
        .expect(401);
    });

    it('should return 403 when the placing account is deactivated (banned)', async () => {
      const token = generateAccessToken(userA.id, userA.role);
      // A still-valid access token, but the account was banned after issuance.
      userRepositoryMock.findById.mockResolvedValue({
        id: userA.id,
        email: 'usera@example.com',
        firstName: 'User',
        isActive: false,
      });
      cartRepositoryMock.findByUserId.mockResolvedValue(makeCart(userA.id));

      await request(app.getHttpServer())
        .post('/api/orders')
        .set('Authorization', `Bearer ${token}`)
        .send({ shippingAddress: validAddress })
        .expect(403);

      expect(orderRepositoryMock.createFromCart).not.toHaveBeenCalled();
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

    it('should return 400 when the nested shippingAddress is incomplete', async () => {
      const token = generateAccessToken(userA.id, userA.role);

      await request(app.getHttpServer())
        .post('/api/orders')
        .set('Authorization', `Bearer ${token}`)
        // shippingAddress is present but missing required nested fields
        // (lastName, phone, address1, city) — nested validation must reject it.
        .send({ shippingAddress: { firstName: 'Olena' } })
        .expect(400);

      expect(orderRepositoryMock.createFromCart).not.toHaveBeenCalled();
    });

    it('should return 400 when shippingAddress is missing the required phone', async () => {
      const token = generateAccessToken(userA.id, userA.role);

      const addressWithoutPhone = {
        firstName: validAddress.firstName,
        lastName: validAddress.lastName,
        address1: validAddress.address1,
        city: validAddress.city,
        country: validAddress.country,
      };

      await request(app.getHttpServer())
        .post('/api/orders')
        .set('Authorization', `Bearer ${token}`)
        .send({ shippingAddress: addressWithoutPhone })
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
      orderRepositoryMock.cancelAndRestock.mockResolvedValue(
        makeOrder({ status: OrderStatus.CANCELLED }),
      );

      const response = await request(app.getHttpServer())
        .patch('/api/orders/order-e2e-1/cancel')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(response.body.data.status).toBe(OrderStatus.CANCELLED);
      expect(orderRepositoryMock.cancelAndRestock).toHaveBeenCalledWith('order-e2e-1');
    });

    it('should return 409 when cancelling a CONFIRMED order', async () => {
      const token = generateAccessToken(userA.id, userA.role);
      orderRepositoryMock.findById.mockResolvedValue(makeOrder({ status: OrderStatus.CONFIRMED }));

      await request(app.getHttpServer())
        .patch('/api/orders/order-e2e-1/cancel')
        .set('Authorization', `Bearer ${token}`)
        .expect(409);

      expect(orderRepositoryMock.cancelAndRestock).not.toHaveBeenCalled();
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

  // ─── GET /api/admin/orders (admin) ──────────────────────────────────────────────

  describe('GET /api/admin/orders', () => {
    it('should return 200 with all users orders for an admin', async () => {
      const token = generateAccessToken(admin.id, admin.role);
      orderRepositoryMock.findAll.mockResolvedValue({
        orders: [makeOrder(), makeOrder({ id: 'order-e2e-2', userId: userB.id })],
        total: 2,
      });

      const response = await request(app.getHttpServer())
        .get('/api/admin/orders')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(response.body.data).toHaveLength(2);
      expect(response.body.meta).toEqual({ total: 2, page: 1, limit: 10, totalPages: 1 });
    });

    it('should pass status, userId and date filters to the repository', async () => {
      const token = generateAccessToken(admin.id, admin.role);
      orderRepositoryMock.findAll.mockResolvedValue({ orders: [], total: 0 });
      // userId filter is validated as a UUID, so use a real UUID here.
      const filterUserId = '550e8400-e29b-41d4-a716-446655440000';

      await request(app.getHttpServer())
        .get(`/api/admin/orders?status=SHIPPED&userId=${filterUserId}&dateFrom=2026-01-01`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(orderRepositoryMock.findAll).toHaveBeenCalledWith(
        expect.objectContaining({
          // TASK-250: admin order `status` is now multi-value — a single
          // `?status=SHIPPED` is transformed to a one-element array.
          status: [OrderStatus.SHIPPED],
          userId: filterUserId,
          dateFrom: '2026-01-01',
        }),
      );
    });

    it('should return 400 for an invalid userId filter', async () => {
      const token = generateAccessToken(admin.id, admin.role);

      await request(app.getHttpServer())
        .get('/api/admin/orders?userId=not-a-uuid')
        .set('Authorization', `Bearer ${token}`)
        .expect(400);

      expect(orderRepositoryMock.findAll).not.toHaveBeenCalled();
    });

    it('should return 403 for a non-admin user', async () => {
      const token = generateAccessToken(userA.id, userA.role);

      await request(app.getHttpServer())
        .get('/api/admin/orders')
        .set('Authorization', `Bearer ${token}`)
        .expect(403);

      expect(orderRepositoryMock.findAll).not.toHaveBeenCalled();
    });

    it('should return 401 without a JWT', async () => {
      await request(app.getHttpServer()).get('/api/admin/orders').expect(401);
    });
  });

  // ─── GET /api/admin/orders/:orderId (admin) ─────────────────────────────────────

  describe('GET /api/admin/orders/:orderId', () => {
    it('should return 200 for any order regardless of owner (admin)', async () => {
      const token = generateAccessToken(admin.id, admin.role);
      // adminGetOrder reads via findByIdForAdmin (customer-joined, TASK-125).
      orderRepositoryMock.findByIdForAdmin.mockResolvedValue(makeOrder({ userId: userB.id }));

      const response = await request(app.getHttpServer())
        .get('/api/admin/orders/order-e2e-1')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expectOrderShape(response.body);
      expect(response.body.data.userId).toBe(userB.id);
    });

    it('should return 404 when the order does not exist', async () => {
      const token = generateAccessToken(admin.id, admin.role);
      orderRepositoryMock.findByIdForAdmin.mockResolvedValue(null);

      await request(app.getHttpServer())
        .get('/api/admin/orders/nonexistent-uuid')
        .set('Authorization', `Bearer ${token}`)
        .expect(404);
    });

    it('should return 403 for a non-admin user', async () => {
      const token = generateAccessToken(userA.id, userA.role);

      await request(app.getHttpServer())
        .get('/api/admin/orders/order-e2e-1')
        .set('Authorization', `Bearer ${token}`)
        .expect(403);
    });

    it('should return 401 without a JWT', async () => {
      await request(app.getHttpServer()).get('/api/admin/orders/order-e2e-1').expect(401);
    });
  });

  // ─── GET /api/admin/orders/:orderId/history (admin) (TASK-251) ───────────────────

  describe('GET /api/admin/orders/:orderId/history', () => {
    const historyRows = [
      {
        id: 'hist-1',
        orderId: 'order-e2e-1',
        changeType: OrderHistoryChangeType.STATUS,
        fromStatus: null,
        toStatus: OrderStatus.PENDING,
        fromPaymentStatus: null,
        toPaymentStatus: null,
        changedBy: null,
        changedAt: new Date('2026-07-08T10:00:00.000Z'),
      },
      {
        id: 'hist-2',
        orderId: 'order-e2e-1',
        changeType: OrderHistoryChangeType.STATUS,
        fromStatus: OrderStatus.PENDING,
        toStatus: OrderStatus.CONFIRMED,
        fromPaymentStatus: null,
        toPaymentStatus: null,
        changedBy: admin.id,
        changedAt: new Date('2026-07-08T11:00:00.000Z'),
      },
    ];

    it('should return 200 with the timeline oldest-first for an existing order (admin)', async () => {
      const token = generateAccessToken(admin.id, admin.role);
      orderRepositoryMock.findById.mockResolvedValue(makeOrder());
      orderRepositoryMock.findHistoryByOrderId.mockResolvedValue(historyRows);

      const response = await request(app.getHttpServer())
        .get('/api/admin/orders/order-e2e-1/history')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(response.body.data).toHaveLength(2);
      expect(response.body.data[0].toStatus).toBe(OrderStatus.PENDING);
      expect(response.body.data[0].changedBy).toBeNull();
      expect(response.body.data[1].fromStatus).toBe(OrderStatus.PENDING);
      expect(response.body.data[1].changedBy).toBe(admin.id);
      expect(orderRepositoryMock.findHistoryByOrderId).toHaveBeenCalledWith('order-e2e-1');
    });

    it('should return 404 when the order does not exist', async () => {
      const token = generateAccessToken(admin.id, admin.role);
      orderRepositoryMock.findById.mockResolvedValue(null);

      await request(app.getHttpServer())
        .get('/api/admin/orders/nonexistent-uuid/history')
        .set('Authorization', `Bearer ${token}`)
        .expect(404);

      expect(orderRepositoryMock.findHistoryByOrderId).not.toHaveBeenCalled();
    });

    it('should return 403 for a non-admin user', async () => {
      const token = generateAccessToken(userA.id, userA.role);

      await request(app.getHttpServer())
        .get('/api/admin/orders/order-e2e-1/history')
        .set('Authorization', `Bearer ${token}`)
        .expect(403);

      expect(orderRepositoryMock.findHistoryByOrderId).not.toHaveBeenCalled();
    });

    it('should return 401 without a JWT', async () => {
      await request(app.getHttpServer()).get('/api/admin/orders/order-e2e-1/history').expect(401);
    });
  });

  // ─── PATCH /api/admin/orders/:orderId/status (admin) ────────────────────────────

  describe('PATCH /api/admin/orders/:orderId/status', () => {
    it('should update the order status for an admin (200)', async () => {
      const token = generateAccessToken(admin.id, admin.role);
      orderRepositoryMock.findById.mockResolvedValue(makeOrder({ status: OrderStatus.CONFIRMED }));
      orderRepositoryMock.updateStatus.mockResolvedValue(
        makeOrder({ status: OrderStatus.PROCESSING }),
      );

      const response = await request(app.getHttpServer())
        .patch('/api/admin/orders/order-e2e-1/status')
        .set('Authorization', `Bearer ${token}`)
        .send({ status: OrderStatus.PROCESSING })
        .expect(200);

      expect(response.body.data.status).toBe(OrderStatus.PROCESSING);
      // TASK-151: status and payment are decoupled — the service forwards the
      // order's current paymentStatus (PENDING here) unchanged as the 3rd arg,
      // never auto-deriving PAID.
      // TASK-254: the 4th arg flags whether the transition crosses the
      // pre-shipment boundary (evict product stock caches); PENDING→PROCESSING
      // stays inside PRE_SHIPMENT, so no eviction is requested.
      // TASK-251: the 2nd arg is the fromStatus (CONFIRMED, from the findById
      // mock), the 3rd the target, the 5th the acting admin's id (changedBy),
      // the 6th the eviction options.
      expect(orderRepositoryMock.updateStatus).toHaveBeenCalledWith(
        'order-e2e-1',
        OrderStatus.CONFIRMED,
        OrderStatus.PROCESSING,
        PaymentStatus.PENDING,
        admin.id,
        { evictProductStockCaches: false },
      );
    });

    // TASK-228: reviving a restocked CANCELLED order must go through the
    // stock re-reserve path, not the plain status update.
    it('should re-reserve stock when reviving a restocked cancelled order (200)', async () => {
      const token = generateAccessToken(admin.id, admin.role);
      orderRepositoryMock.findById.mockResolvedValue(
        makeOrder({
          status: OrderStatus.CANCELLED,
          restockedAt: new Date('2026-07-04T10:00:00.000Z'),
        }),
      );
      orderRepositoryMock.reviveAndReserve.mockResolvedValue(
        makeOrder({ status: OrderStatus.PENDING, restockedAt: null }),
      );

      const response = await request(app.getHttpServer())
        .patch('/api/admin/orders/order-e2e-1/status')
        .set('Authorization', `Bearer ${token}`)
        .send({ status: OrderStatus.PENDING })
        .expect(200);

      expect(response.body.data.status).toBe(OrderStatus.PENDING);
      expect(orderRepositoryMock.reviveAndReserve).toHaveBeenCalledWith(
        'order-e2e-1',
        OrderStatus.PENDING,
        PaymentStatus.PENDING,
        admin.id,
      );
      expect(orderRepositoryMock.updateStatus).not.toHaveBeenCalled();
    });

    it('should return 409 when a revive cannot re-reserve stock (sold out meanwhile)', async () => {
      const token = generateAccessToken(admin.id, admin.role);
      orderRepositoryMock.findById.mockResolvedValue(
        makeOrder({
          status: OrderStatus.CANCELLED,
          restockedAt: new Date('2026-07-04T10:00:00.000Z'),
        }),
      );
      orderRepositoryMock.reviveAndReserve.mockRejectedValue(
        new ConflictException(
          'Insufficient stock for "iPhone 15 Pro Case" — cannot revive the order',
        ),
      );

      await request(app.getHttpServer())
        .patch('/api/admin/orders/order-e2e-1/status')
        .set('Authorization', `Bearer ${token}`)
        .send({ status: OrderStatus.PENDING })
        .expect(409);

      expect(orderRepositoryMock.updateStatus).not.toHaveBeenCalled();
    });

    it('should return 400 for an invalid status value', async () => {
      const token = generateAccessToken(admin.id, admin.role);

      await request(app.getHttpServer())
        .patch('/api/admin/orders/order-e2e-1/status')
        .set('Authorization', `Bearer ${token}`)
        .send({ status: 'NOT_A_STATUS' })
        .expect(400);

      expect(orderRepositoryMock.updateStatus).not.toHaveBeenCalled();
    });

    it('should return 404 when the order does not exist', async () => {
      const token = generateAccessToken(admin.id, admin.role);
      orderRepositoryMock.findById.mockResolvedValue(null);

      await request(app.getHttpServer())
        .patch('/api/admin/orders/nonexistent-uuid/status')
        .set('Authorization', `Bearer ${token}`)
        .send({ status: OrderStatus.PROCESSING })
        .expect(404);

      expect(orderRepositoryMock.updateStatus).not.toHaveBeenCalled();
    });

    it('should return 403 for a non-admin user', async () => {
      const token = generateAccessToken(userA.id, userA.role);

      await request(app.getHttpServer())
        .patch('/api/admin/orders/order-e2e-1/status')
        .set('Authorization', `Bearer ${token}`)
        .send({ status: OrderStatus.PROCESSING })
        .expect(403);

      expect(orderRepositoryMock.updateStatus).not.toHaveBeenCalled();
    });

    it('should return 401 without a JWT', async () => {
      await request(app.getHttpServer())
        .patch('/api/admin/orders/order-e2e-1/status')
        .send({ status: OrderStatus.PROCESSING })
        .expect(401);
    });
  });

  // ─── PATCH /api/admin/orders/:orderId/payment-status (admin) (TASK-151) ──────────

  describe('PATCH /api/admin/orders/:orderId/payment-status', () => {
    it('should update the payment status for an admin without changing order status (200)', async () => {
      const token = generateAccessToken(admin.id, admin.role);
      orderRepositoryMock.findById.mockResolvedValue(makeOrder({ status: OrderStatus.PENDING }));
      orderRepositoryMock.updatePaymentStatus.mockResolvedValue(
        makeOrder({ status: OrderStatus.PENDING, paymentStatus: PaymentStatus.PAID }),
      );

      const response = await request(app.getHttpServer())
        .patch('/api/admin/orders/order-e2e-1/payment-status')
        .set('Authorization', `Bearer ${token}`)
        .send({ paymentStatus: PaymentStatus.PAID })
        .expect(200);

      expect(response.body.data.paymentStatus).toBe(PaymentStatus.PAID);
      expect(response.body.data.status).toBe(OrderStatus.PENDING);
      expect(orderRepositoryMock.updatePaymentStatus).toHaveBeenCalledWith(
        'order-e2e-1',
        PaymentStatus.PAID,
        admin.id,
      );
    });

    it('should return 400 for an invalid payment status value', async () => {
      const token = generateAccessToken(admin.id, admin.role);

      await request(app.getHttpServer())
        .patch('/api/admin/orders/order-e2e-1/payment-status')
        .set('Authorization', `Bearer ${token}`)
        .send({ paymentStatus: 'NOT_A_PAYMENT_STATUS' })
        .expect(400);

      expect(orderRepositoryMock.updatePaymentStatus).not.toHaveBeenCalled();
    });

    it('should return 404 when the order does not exist', async () => {
      const token = generateAccessToken(admin.id, admin.role);
      orderRepositoryMock.findById.mockResolvedValue(null);

      await request(app.getHttpServer())
        .patch('/api/admin/orders/nonexistent-uuid/payment-status')
        .set('Authorization', `Bearer ${token}`)
        .send({ paymentStatus: PaymentStatus.PAID })
        .expect(404);

      expect(orderRepositoryMock.updatePaymentStatus).not.toHaveBeenCalled();
    });

    it('should return 403 for a non-admin user', async () => {
      const token = generateAccessToken(userA.id, userA.role);

      await request(app.getHttpServer())
        .patch('/api/admin/orders/order-e2e-1/payment-status')
        .set('Authorization', `Bearer ${token}`)
        .send({ paymentStatus: PaymentStatus.PAID })
        .expect(403);

      expect(orderRepositoryMock.updatePaymentStatus).not.toHaveBeenCalled();
    });

    it('should return 401 without a JWT', async () => {
      await request(app.getHttpServer())
        .patch('/api/admin/orders/order-e2e-1/payment-status')
        .send({ paymentStatus: PaymentStatus.PAID })
        .expect(401);
    });
  });
});
