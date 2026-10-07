import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule, ThrottlerStorage } from '@nestjs/throttler';
import { JwtService } from '@nestjs/jwt';
import {
  NotificationAudience,
  NotificationChannel,
  OrderStatus,
  PaymentStatus,
} from '@prisma/client';
import { createHash } from 'crypto';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma';
import { PermissionRepository } from '../src/auth/permissions';
import { UserRepository } from '../src/user/user.repository';
import { CartRepository, type CartWithItems } from '../src/cart/cart.repository';
import { OrderRepository } from '../src/order/order.repository';
import { MailService } from '../src/mail/mail.service';
import { NotificationOutboxService } from '../src/notification-outbox';
import { NovaPoshtaClient } from '../src/delivery';
import { TelegramClient } from '../src/notification/telegram/telegram.client';
import {
  TelegramChannelState,
  type TelegramChannelSnapshot,
} from '../src/notification/telegram/telegram-channel.state';
import type { OrderWithItems } from '../src/order/order.types';
import { createCartRepositoryMock } from './cart-repository.mock';
import { createPermissionRepositoryMock } from './permission-repository.mock';

/**
 * A customer's Telegram notifications over HTTP (TASK-679, owner decisions
 * 2026-10-07): the account routes under `/users/me`, the guest routes under
 * `/orders/guest/:token`, and the guest's token on `POST /orders`.
 *
 * The binding service, its repository and `CustomerTelegramService` are REAL —
 * only Prisma underneath them is a double — so every assertion on a Prisma
 * `where` is the query production would send. That is the point: "a customer can
 * never reach another's chat or a shop chat" is a property of those filters, and
 * the database half (the partial unique indexes) is proved on Postgres by
 * `notification-binding.int-spec.ts`. The order side runs the real OrderService
 * over a mocked OrderRepository, as `order.e2e-spec.ts` does.
 *
 * No network: the Telegram channel state and client are doubles whose state each
 * test sets; `setup-e2e.ts` also forces TELEGRAM_BOT_TOKEN empty.
 */
describe('Customer Telegram notifications (e2e)', () => {
  let app: INestApplication;
  let jwtService: JwtService;

  const userA = { id: 'user-a-notify-1', role: 'CUSTOMER' };
  const userB = { id: 'user-b-notify-1', role: 'CUSTOMER' };

  const prismaServiceMock = {
    $connect: jest.fn(),
    $disconnect: jest.fn(),
    $queryRaw: jest.fn(),
    addonService: { findMany: jest.fn() },
    categoryAddonTemplate: { findMany: jest.fn() },
    addonServiceDelta: { findMany: jest.fn() },
    deliverySetting: { findUnique: jest.fn() },
    pickupPoint: { findMany: jest.fn(), findFirst: jest.fn() },
    auditLog: { create: jest.fn() },
    notificationBinding: { findMany: jest.fn(), updateMany: jest.fn() },
    notificationBindingToken: { create: jest.fn() },
  };
  const orderRepositoryMock = { createFromCart: jest.fn(), findByAccessTokenHash: jest.fn() };
  const cartRepositoryMock = createCartRepositoryMock();
  const userRepositoryMock = { findById: jest.fn() };
  const mailOutboxServiceMock = {
    enqueueOrderConfirmation: jest.fn(),
    dispatchDue: jest.fn(),
  };
  const novaPoshtaClientMock = {
    isConfigured: jest.fn(),
    searchCities: jest.fn(),
    searchWarehouses: jest.fn(),
    estimateShipping: jest.fn(),
  };

  let snapshot: TelegramChannelSnapshot;
  const channelState = {
    onModuleInit: () => undefined,
    snapshot: () => snapshot,
    isOk: () => snapshot.state === 'ok',
    ensureFresh: () => Promise.resolve(snapshot),
    markFailed: jest.fn(),
  };
  const telegramClient = {
    isConfigured: () => false,
    getMe: jest.fn(),
    getUpdates: jest.fn(),
    sendMessage: jest.fn(),
  };

  const RAW_TOKEN = 'c'.repeat(64);
  const hashOf = (raw: string) => createHash('sha256').update(raw).digest('hex');

  const address = {
    firstName: 'Olena',
    lastName: 'Shevchenko',
    phone: '+380501234567',
    address1: 'вул. Хрещатик, 1',
    city: 'Kyiv',
    country: 'UA',
  };

  const makeOrder = (overrides: Partial<OrderWithItems> = {}): OrderWithItems =>
    ({
      id: 'order-guest-1',
      userId: null,
      status: OrderStatus.PENDING,
      paymentStatus: PaymentStatus.PENDING,
      subtotal: { toString: () => '59.98' },
      discount: { toString: () => '0' },
      discountCode: null,
      shippingCost: { toString: () => '0' },
      tax: { toString: () => '0' },
      addonsTotal: { toString: () => '0' },
      total: { toString: () => '59.98' },
      shippingAddress: address,
      billingAddress: null,
      notes: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      restockedAt: null,
      items: [],
      ...overrides,
    }) as unknown as OrderWithItems;

  const cart = (userId: string | null): CartWithItems => ({
    id: 'cart-notify-1',
    userId,
    token: userId ? null : 'guest-cart-notify',
    createdAt: new Date(),
    updatedAt: new Date(),
    items: [
      {
        id: 'cart-item-notify-1',
        productId: 'prod-notify-1',
        quantity: 2,
        createdAt: new Date(),
        updatedAt: new Date(),
        addons: [],
        product: {
          id: 'prod-notify-1',
          name: 'Чохол',
          slug: 'chokhol',
          price: { toString: () => '29.99' },
          compareAtPrice: null,
          stock: 50,
          isActive: true,
          categoryId: 'cat-notify-1',
          category: { isActive: true },
          images: [],
        },
      },
    ] as unknown as CartWithItems['items'],
  });

  const bearer = (user: { id: string; role: string }) =>
    `Bearer ${jwtService.sign(
      { sub: user.id, role: user.role },
      { secret: process.env.JWT_SECRET, expiresIn: '15m' },
    )}`;

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
      .useValue(createPermissionRepositoryMock())
      .overrideProvider(UserRepository)
      .useValue(userRepositoryMock)
      .overrideProvider(CartRepository)
      .useValue(cartRepositoryMock)
      .overrideProvider(OrderRepository)
      .useValue(orderRepositoryMock)
      .overrideProvider(MailService)
      .useValue({ isEnabled: () => false })
      .overrideProvider(NotificationOutboxService)
      .useValue(mailOutboxServiceMock)
      .overrideProvider(NovaPoshtaClient)
      .useValue(novaPoshtaClientMock)
      .overrideProvider(TelegramChannelState)
      .useValue(channelState)
      .overrideProvider(TelegramClient)
      .useValue(telegramClient)
      // See order.e2e-spec.ts: the counter, not the guard, is what disables limits.
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
    jwtService = moduleFixture.get<JwtService>(JwtService);
    app.use(cookieParser());
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
    snapshot = { state: 'ok', botUsername: 'shop_bot', checkedAt: new Date() };
    prismaServiceMock.$queryRaw.mockResolvedValue([]);
    prismaServiceMock.addonService.findMany.mockResolvedValue([]);
    prismaServiceMock.categoryAddonTemplate.findMany.mockResolvedValue([]);
    prismaServiceMock.addonServiceDelta.findMany.mockResolvedValue([]);
    prismaServiceMock.deliverySetting.findUnique.mockResolvedValue(null);
    prismaServiceMock.pickupPoint.findMany.mockResolvedValue([]);
    prismaServiceMock.notificationBinding.findMany.mockResolvedValue([]);
    prismaServiceMock.notificationBinding.updateMany.mockResolvedValue({ count: 0 });
    prismaServiceMock.notificationBindingToken.create.mockResolvedValue({});
    novaPoshtaClientMock.isConfigured.mockReturnValue(true);
    novaPoshtaClientMock.estimateShipping.mockResolvedValue({ cost: 0, etaDays: 2 });
    orderRepositoryMock.findByAccessTokenHash.mockResolvedValue(makeOrder());
  });

  /** The CUSTOMER token row the last link call stored. */
  const storedToken = () =>
    prismaServiceMock.notificationBindingToken.create.mock.calls[0][0].data as Record<
      string,
      unknown
    >;

  // ─── The account ────────────────────────────────────────────────────────────

  describe('/api/users/me/notifications/telegram', () => {
    const BASE = '/api/users/me/notifications/telegram';

    it.each([
      ['get', BASE],
      ['post', `${BASE}/link`],
      ['delete', BASE],
    ] as const)('%s %s → 401 without a session', async (method, path) => {
      await request(app.getHttpServer())[method](path).expect(401);
      expect(prismaServiceMock.notificationBinding.findMany).not.toHaveBeenCalled();
      expect(prismaServiceMock.notificationBinding.updateMany).not.toHaveBeenCalled();
      expect(prismaServiceMock.notificationBindingToken.create).not.toHaveBeenCalled();
    });

    it('GET: available and not connected, reading only the caller’s CUSTOMER rows', async () => {
      const res = await request(app.getHttpServer())
        .get(BASE)
        .set('Authorization', bearer(userA))
        .expect(200);

      expect(res.body).toEqual({
        data: { available: true, connected: false, botUsername: 'shop_bot' },
      });
      expect(prismaServiceMock.notificationBinding.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            channel: NotificationChannel.TELEGRAM,
            audience: NotificationAudience.CUSTOMER,
            revokedAt: null,
            // Its own rows, and those of guest orders it has claimed — both by the session's id.
            OR: [{ userId: userA.id }, { order: { is: { userId: userA.id } } }],
          },
        }),
      );
    });

    it('GET: a connected chat is named', async () => {
      prismaServiceMock.notificationBinding.findMany.mockResolvedValue([
        {
          id: 'b-1',
          channel: NotificationChannel.TELEGRAM,
          audience: NotificationAudience.CUSTOMER,
          externalId: '777',
          label: '@olena',
          userId: userA.id,
          orderId: null,
          createdAt: new Date('2026-10-07T10:00:00.000Z'),
          revokedAt: null,
        },
      ]);

      const res = await request(app.getHttpServer())
        .get(BASE)
        .set('Authorization', bearer(userA))
        .expect(200);

      expect(res.body.data).toEqual({
        available: true,
        connected: true,
        label: '@olena',
        createdAt: '2026-10-07T10:00:00.000Z',
        botUsername: 'shop_bot',
      });
    });

    it('GET: an unconfigured bot SAYS so — available:false, no reason leaked', async () => {
      snapshot = { state: 'unconfigured' };

      const res = await request(app.getHttpServer())
        .get(BASE)
        .set('Authorization', bearer(userA))
        .expect(200);

      expect(res.body).toEqual({ data: { available: false, connected: false } });
    });

    it('POST link: a private deep link, a CUSTOMER token for the caller', async () => {
      const res = await request(app.getHttpServer())
        .post(`${BASE}/link`)
        .set('Authorization', bearer(userA))
        .expect(200);

      expect(res.body.data.deepLink).toMatch(
        /^https:\/\/t\.me\/shop_bot\?start=[A-Za-z0-9_-]{43}$/,
      );
      expect(res.body.data).not.toHaveProperty('groupDeepLink');
      expect(Date.parse(res.body.data.expiresAt)).toBeGreaterThan(Date.now());
      expect(storedToken()).toMatchObject({
        channel: NotificationChannel.TELEGRAM,
        audience: NotificationAudience.CUSTOMER,
        userId: userA.id,
        orderId: null,
      });
      // Only the hash is stored — never the token that is in the link.
      const raw = (res.body.data.deepLink as string).split('start=')[1];
      expect(storedToken().tokenHash).toBe(hashOf(raw));
    });

    it('POST link: 409 while the bot is unconfigured, and no token is issued', async () => {
      snapshot = { state: 'unconfigured' };

      await request(app.getHttpServer())
        .post(`${BASE}/link`)
        .set('Authorization', bearer(userA))
        .expect(409);

      expect(prismaServiceMock.notificationBindingToken.create).not.toHaveBeenCalled();
    });

    it('DELETE: revokes only the caller’s CUSTOMER chats — never another account’s', async () => {
      prismaServiceMock.notificationBinding.updateMany.mockResolvedValue({ count: 1 });

      // User B tries to name user A in every place a request can carry a value.
      await request(app.getHttpServer())
        .delete(`${BASE}?userId=${userA.id}`)
        .set('Authorization', bearer(userB))
        .send({ userId: userA.id })
        .expect(204);

      expect(prismaServiceMock.notificationBinding.updateMany).toHaveBeenCalledTimes(1);
      const { where } = prismaServiceMock.notificationBinding.updateMany.mock.calls[0][0];
      expect(where).toEqual({
        channel: NotificationChannel.TELEGRAM,
        audience: NotificationAudience.CUSTOMER,
        revokedAt: null,
        OR: [{ userId: userB.id }, { order: { is: { userId: userB.id } } }],
      });
      expect(JSON.stringify(where)).not.toContain(userA.id);
    });

    it('DELETE: idempotent — nothing connected is still 204', async () => {
      await request(app.getHttpServer())
        .delete(BASE)
        .set('Authorization', bearer(userA))
        .expect(204);
    });
  });

  // ─── The guest order ────────────────────────────────────────────────────────

  describe('/api/orders/guest/:token/notifications/telegram', () => {
    const base = (token = RAW_TOKEN) => `/api/orders/guest/${token}/notifications/telegram`;

    it('GET: resolves the order by the token’s hash and reads that order’s chats', async () => {
      const res = await request(app.getHttpServer()).get(base()).expect(200);

      expect(res.body).toEqual({
        data: { available: true, connected: false, botUsername: 'shop_bot' },
      });
      expect(orderRepositoryMock.findByAccessTokenHash).toHaveBeenCalledWith(hashOf(RAW_TOKEN));
      expect(prismaServiceMock.notificationBinding.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            audience: NotificationAudience.CUSTOMER,
            OR: [{ orderId: 'order-guest-1' }],
          }),
        }),
      );
    });

    it('POST link: a CUSTOMER token carrying the ORDER, never an account', async () => {
      const res = await request(app.getHttpServer()).post(`${base()}/link`).expect(200);

      expect(res.body.data.deepLink).toMatch(/^https:\/\/t\.me\/shop_bot\?start=/);
      expect(storedToken()).toMatchObject({
        audience: NotificationAudience.CUSTOMER,
        orderId: 'order-guest-1',
        userId: null,
      });
    });

    it('POST link: 409 while the bot is unconfigured, and GET says available:false', async () => {
      snapshot = { state: 'unconfigured' };

      await request(app.getHttpServer()).post(`${base()}/link`).expect(409);
      const res = await request(app.getHttpServer()).get(base()).expect(200);

      expect(res.body.data.available).toBe(false);
      expect(prismaServiceMock.notificationBindingToken.create).not.toHaveBeenCalled();
    });

    describe.each([
      ['an unknown token', () => orderRepositoryMock.findByAccessTokenHash.mockResolvedValue(null)],
      [
        'an expired token',
        () =>
          orderRepositoryMock.findByAccessTokenHash.mockResolvedValue(
            makeOrder({ createdAt: new Date(Date.now() - 400 * 24 * 60 * 60 * 1000) }),
          ),
      ],
      [
        'an order that belongs to an account',
        () =>
          orderRepositoryMock.findByAccessTokenHash.mockResolvedValue(
            makeOrder({ userId: userA.id }),
          ),
      ],
    ])('%s → the same 404, nothing read or issued', (_label, arrange) => {
      it.each(['get', 'post'] as const)('%s', async (method) => {
        arrange();
        const path = method === 'get' ? base() : `${base()}/link`;

        const res = await request(app.getHttpServer())[method](path).expect(404);

        expect(res.body.message).toBe('Order not found');
        expect(prismaServiceMock.notificationBinding.findMany).not.toHaveBeenCalled();
        expect(prismaServiceMock.notificationBindingToken.create).not.toHaveBeenCalled();
      });
    });
  });

  // ─── The guest's proof of ownership on POST /orders ─────────────────────────

  describe('POST /api/orders — guestAccessToken', () => {
    const txStub = {
      notificationOutbox: { create: jest.fn() },
      notificationBinding: { findMany: jest.fn().mockResolvedValue([]) },
    };

    beforeEach(() => {
      orderRepositoryMock.createFromCart.mockImplementation(
        async (
          params: { userId: string | null },
          afterCreate?: (tx: unknown, created: OrderWithItems) => Promise<void>,
        ) => {
          const created = makeOrder({ userId: params.userId });
          if (afterCreate) await afterCreate(txStub, created);
          return created;
        },
      );
    });

    it('a guest gets the token whose hash was stored — the one the letter carries', async () => {
      cartRepositoryMock.findByToken.mockResolvedValue(cart(null));

      const res = await request(app.getHttpServer())
        .post('/api/orders')
        .set('Cookie', ['cartToken=guest-cart-notify'])
        .send({
          shippingAddress: address,
          contact: { email: 'guest@example.com', phone: '+380671112233', name: 'Гість' },
        })
        .expect(201);

      const token = res.body.data.guestAccessToken as string;
      expect(token).toMatch(/^[a-f0-9]{64}$/);
      const params = orderRepositoryMock.createFromCart.mock.calls[0][0] as {
        guest: { accessTokenHash: string };
      };
      expect(params.guest.accessTokenHash).toBe(hashOf(token));
    });

    it('a signed-in shopper gets none', async () => {
      userRepositoryMock.findById.mockResolvedValue({
        id: userA.id,
        email: 'usera@example.com',
        firstName: 'User',
        isActive: true,
      });
      cartRepositoryMock.findByUserId.mockResolvedValue(cart(userA.id));

      const res = await request(app.getHttpServer())
        .post('/api/orders')
        .set('Authorization', bearer(userA))
        .send({ shippingAddress: address })
        .expect(201);

      expect(res.body.data.id).toBe('order-guest-1');
      expect(res.body.data).not.toHaveProperty('guestAccessToken');
    });

    it('the guest read never returns it', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/orders/guest/${RAW_TOKEN}`)
        .expect(200);

      expect(res.body.data).not.toHaveProperty('guestAccessToken');
    });
  });
});
