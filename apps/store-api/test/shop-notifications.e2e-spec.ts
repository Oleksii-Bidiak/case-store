import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule, ThrottlerStorage } from '@nestjs/throttler';
import { JwtService } from '@nestjs/jwt';
import { ContactMessageStatus, OrderStatus, ReturnStatus } from '@prisma/client';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { AuthRepository } from '../src/auth/auth.repository';
import { PrismaService } from '../src/prisma';
import { PermissionRepository } from '../src/auth/permissions';
import { createPermissionRepositoryMock } from './permission-repository.mock';

/**
 * E2E: the shop's Telegram pings for the contact form and for return requests
 * (TASK-677, plan 187). The storefront order ping lives in `order.e2e-spec.ts`,
 * next to the checkout fixture it needs.
 *
 * `PrismaService` is the double and EVERYTHING above it is real — the services,
 * their repositories, `ShopNotifier`, `NotificationBindingService` and the
 * outbox repository. That is the only level at which the guarantee is visible:
 * the SHOP chats are read and the outbox row is written through the SAME
 * transaction client the event's own insert went through. Each `$transaction`
 * hands the callback a distinct `tx` object, so a write that slipped onto the
 * base client would show up on the wrong spy.
 *
 * No real database is involved.
 */
describe('Shop notifications (e2e, TASK-677)', () => {
  let app: INestApplication;
  let jwtService: JwtService;

  const SHOP_CHAT_A = '-1001111111111';
  const SHOP_CHAT_B = '222222222';
  const ORDER_ID = '550e8400-e29b-41d4-a716-4466554400ff';
  const LINE_ID = '550e8400-e29b-41d4-a716-446655440001';
  const RETURN_ID = '550e8400-e29b-41d4-a716-446655440abc';
  const MESSAGE_ID = '550e8400-e29b-41d4-a716-446655440def';
  const now = new Date('2026-10-01T10:00:00.000Z');

  const testCustomer = { id: 'customer-e2e-1', role: 'CUSTOMER' as const };
  const testAdmin = { id: 'admin-e2e-1', role: 'ADMIN' as const };

  const authRepositoryMock = {
    findByEmail: jest.fn(),
    findById: jest.fn(),
    createUser: jest.fn(),
    findRefreshToken: jest.fn(),
    saveRefreshToken: jest.fn(),
    revokeToken: jest.fn(),
    revokeAllUserTokens: jest.fn(),
  };

  /** The client handed to every interactive `$transaction` callback. */
  const tx = {
    $queryRaw: jest.fn(),
    contactMessage: { create: jest.fn() },
    return: { findMany: jest.fn(), create: jest.fn() },
    notificationBinding: { findMany: jest.fn() },
    notificationOutbox: { create: jest.fn() },
  };

  const prismaServiceMock = {
    $connect: jest.fn(),
    $disconnect: jest.fn(),
    $queryRaw: jest.fn(),
    $transaction: jest.fn(),
    user: { findUnique: jest.fn(), findFirst: jest.fn(), findMany: jest.fn(), create: jest.fn() },
    refreshToken: {
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
    },
    contactMessage: { create: jest.fn() },
    order: { findFirst: jest.fn() },
    return: { findMany: jest.fn(), create: jest.fn() },
    notificationBinding: { findMany: jest.fn() },
    notificationOutbox: { create: jest.fn() },
    auditLog: { create: jest.fn() },
  };

  const bindingRow = (externalId: string) => ({
    id: `binding-${externalId}`,
    channel: 'TELEGRAM',
    audience: 'SHOP',
    externalId,
    label: null,
    userId: null,
    orderId: null,
    createdAt: now,
    revokedAt: null,
  });

  const messageRow = (overrides: Record<string, unknown> = {}) => ({
    id: MESSAGE_ID,
    name: 'Ivan <b>Petrenko</b>',
    phone: '+380671234567',
    email: 'ivan@example.com',
    topic: 'order',
    orderRef: null,
    message: 'Доброго дня! Де моє замовлення?',
    status: ContactMessageStatus.NEW,
    adminNote: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  });

  const deliveredOrder = {
    id: ORDER_ID,
    userId: testCustomer.id,
    status: OrderStatus.DELIVERED,
    restockedAt: null,
    createdAt: now,
    updatedAt: now,
    items: [
      {
        id: LINE_ID,
        orderId: ORDER_ID,
        productId: 'product-1',
        quantity: 3,
        price: { toString: () => '499.00' },
        createdAt: now,
        product: { id: 'product-1', name: 'Case', slug: 'case', images: [] },
        addons: [],
      },
    ],
  };

  const returnRow = {
    id: RETURN_ID,
    orderId: ORDER_ID,
    status: ReturnStatus.REQUESTED,
    reason: 'Не підійшов розмір',
    operatorNotes: null,
    requestedAt: now,
    resolvedAt: null,
    restockedAt: null,
    refundedAmount: null,
    createdByUserId: testCustomer.id,
    createdAt: now,
    updatedAt: now,
    items: [
      {
        id: 'return-item-1',
        returnId: RETURN_ID,
        orderItemId: LINE_ID,
        quantity: 2,
        createdAt: now,
        orderItem: {
          id: LINE_ID,
          productId: 'product-1',
          quantity: 3,
          price: { toString: () => '499.00' },
          product: { id: 'product-1', name: 'Case', slug: 'case' },
        },
      },
    ],
  };

  const token = (user: { id: string; role: string }): string =>
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
      .overrideProvider(AuthRepository)
      .useValue(authRepositoryMock)
      // The contact form and the return route carry their own low @Throttle;
      // replacing the COUNTER is what reliably disables every limit (see the
      // note in order.e2e-spec.ts).
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
    prismaServiceMock.$transaction.mockImplementation((callback: unknown) =>
      typeof callback === 'function'
        ? (callback as (client: typeof tx) => Promise<unknown>)(tx)
        : Promise.all(callback as Promise<unknown>[]),
    );
    // No earlier message from this address — the cooldown lets it through.
    prismaServiceMock.$queryRaw.mockResolvedValue([]);
    tx.$queryRaw.mockResolvedValue([{ id: ORDER_ID }]);
    tx.return.findMany.mockResolvedValue([]);
    tx.return.create.mockResolvedValue(returnRow);
    tx.notificationOutbox.create.mockResolvedValue({});
    prismaServiceMock.return.findMany.mockResolvedValue([]);
    prismaServiceMock.return.create.mockResolvedValue(returnRow);
    prismaServiceMock.order.findFirst.mockResolvedValue(deliveredOrder);
    prismaServiceMock.auditLog.create.mockResolvedValue({});
  });

  /** The `data` of every outbox row written through the transaction. */
  const queuedRows = (): Array<Record<string, unknown>> =>
    tx.notificationOutbox.create.mock.calls.map(
      ([args]) => (args as { data: Record<string, unknown> }).data,
    );

  // ─── Contact form ──────────────────────────────────────────────────────────

  describe('POST /api/contact', () => {
    const body = {
      name: 'Ivan <b>Petrenko</b>',
      phone: '+380 67 123 45 67',
      email: 'ivan@example.com',
      message: 'Доброго дня! Де моє замовлення?',
    };

    it('queues one TELEGRAM row per SHOP chat, in the message transaction', async () => {
      tx.contactMessage.create.mockResolvedValue(messageRow());
      tx.notificationBinding.findMany.mockResolvedValue([
        bindingRow(SHOP_CHAT_A),
        bindingRow(SHOP_CHAT_B),
      ]);

      await request(app.getHttpServer()).post('/api/contact').send(body).expect(201);

      // The message itself went through the transaction, not the base client…
      expect(tx.contactMessage.create).toHaveBeenCalledTimes(1);
      expect(prismaServiceMock.contactMessage.create).not.toHaveBeenCalled();
      // …and so did the recipient lookup and the pings.
      expect(tx.notificationBinding.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { channel: 'TELEGRAM', audience: 'SHOP', revokedAt: null },
        }),
      );
      expect(prismaServiceMock.notificationOutbox.create).not.toHaveBeenCalled();
      expect(queuedRows()).toEqual([
        expect.objectContaining({
          type: 'shop-contact-message',
          channel: 'TELEGRAM',
          recipientAddress: SHOP_CHAT_A,
          payload: expect.objectContaining({
            messageId: MESSAGE_ID,
            name: 'Ivan <b>Petrenko</b>',
            excerpt: 'Доброго дня! Де моє замовлення?',
          }),
        }),
        expect.objectContaining({ channel: 'TELEGRAM', recipientAddress: SHOP_CHAT_B }),
      ]);
    });

    it('queues nothing when no shop chat is connected — the message is still accepted', async () => {
      tx.contactMessage.create.mockResolvedValue(messageRow());
      tx.notificationBinding.findMany.mockResolvedValue([]);

      await request(app.getHttpServer()).post('/api/contact').send(body).expect(201);

      expect(tx.contactMessage.create).toHaveBeenCalledTimes(1);
      expect(tx.notificationOutbox.create).not.toHaveBeenCalled();
    });

    it('never pings for a honeypot hit — a plain SPAM insert, no transaction', async () => {
      prismaServiceMock.contactMessage.create.mockResolvedValue(
        messageRow({ status: ContactMessageStatus.SPAM }),
      );
      tx.notificationBinding.findMany.mockResolvedValue([bindingRow(SHOP_CHAT_A)]);

      await request(app.getHttpServer())
        .post('/api/contact')
        .send({ ...body, website: 'https://spam.example' })
        .expect(201);

      expect(prismaServiceMock.contactMessage.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ status: ContactMessageStatus.SPAM }),
      });
      expect(prismaServiceMock.$transaction).not.toHaveBeenCalled();
      expect(tx.notificationBinding.findMany).not.toHaveBeenCalled();
      expect(tx.notificationOutbox.create).not.toHaveBeenCalled();
    });
  });

  // ─── Returns ───────────────────────────────────────────────────────────────

  describe('POST /api/orders/:orderId/returns (customer)', () => {
    const body = { items: [{ orderItemId: LINE_ID, quantity: 2 }], reason: 'Не підійшов розмір' };

    it('queues the ping in the return transaction', async () => {
      tx.notificationBinding.findMany.mockResolvedValue([bindingRow(SHOP_CHAT_A)]);

      await request(app.getHttpServer())
        .post(`/api/orders/${ORDER_ID}/returns`)
        .set('Authorization', token(testCustomer))
        .send(body)
        .expect(201);

      expect(tx.return.create).toHaveBeenCalledTimes(1);
      expect(queuedRows()).toEqual([
        {
          type: 'shop-return-requested',
          channel: 'TELEGRAM',
          recipientAddress: SHOP_CHAT_A,
          payload: {
            returnId: RETURN_ID,
            orderId: ORDER_ID,
            itemsCount: 2,
            reason: 'Не підійшов розмір',
          },
        },
      ]);
      expect(prismaServiceMock.notificationOutbox.create).not.toHaveBeenCalled();
    });

    it('queues nothing when no shop chat is connected', async () => {
      tx.notificationBinding.findMany.mockResolvedValue([]);

      await request(app.getHttpServer())
        .post(`/api/orders/${ORDER_ID}/returns`)
        .set('Authorization', token(testCustomer))
        .send(body)
        .expect(201);

      expect(tx.return.create).toHaveBeenCalledTimes(1);
      expect(tx.notificationOutbox.create).not.toHaveBeenCalled();
    });

    it('rolls the request back when the ping cannot be queued (the error reaches the caller)', async () => {
      tx.notificationBinding.findMany.mockResolvedValue([bindingRow(SHOP_CHAT_A)]);
      tx.notificationOutbox.create.mockRejectedValueOnce(new Error('outbox insert failed'));

      await request(app.getHttpServer())
        .post(`/api/orders/${ORDER_ID}/returns`)
        .set('Authorization', token(testCustomer))
        .send(body)
        .expect(500);
    });
  });

  describe('POST /api/admin/orders/:orderId/returns (operator)', () => {
    it('never pings — staff opened it', async () => {
      tx.notificationBinding.findMany.mockResolvedValue([bindingRow(SHOP_CHAT_A)]);

      await request(app.getHttpServer())
        .post(`/api/admin/orders/${ORDER_ID}/returns`)
        .set('Authorization', token(testAdmin))
        .send({ items: [{ orderItemId: LINE_ID, quantity: 1 }] })
        .expect(201);

      expect(tx.return.create).toHaveBeenCalledTimes(1);
      expect(tx.notificationBinding.findMany).not.toHaveBeenCalled();
      expect(tx.notificationOutbox.create).not.toHaveBeenCalled();
      expect(prismaServiceMock.notificationOutbox.create).not.toHaveBeenCalled();
    });
  });
});
