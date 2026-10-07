import { ConfigModule } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import {
  DeliveryMethod,
  NotificationAudience,
  NotificationChannel,
  OrderStatus,
  Prisma,
} from '@prisma/client';
import { PinoLogger } from 'nestjs-pino';
import { randomUUID } from 'crypto';
import { OrderRepository } from '../src/order/order.repository';
import { OrderLookupRepository } from '../src/order/order-lookup.repository';
import { OrderService } from '../src/order/order.service';
import type { CreateOrderParams } from '../src/order/order.types';
import type { CreateOrderDto } from '../src/order/dto/create-order.dto';
import { AddonApplicabilityResolver } from '../src/addon-service';
import { CacheService } from '../src/cache';
import { CartService } from '../src/cart';
import { CartRepository } from '../src/cart/cart.repository';
import { DeliveryService } from '../src/delivery';
import { DiscountService } from '../src/discount';
import { PrismaService } from '../src/prisma';
import { ProductIndexer } from '../src/search/product-indexer';
import { UserRepository } from '../src/user';
import { NotificationBindingRepository } from '../src/notification/notification-binding.repository';
import {
  hashBindingToken,
  NotificationBindingService,
} from '../src/notification/notification-binding.service';
import { CustomerNotifier } from '../src/notification/customer-notifier.service';
import { ShopNotifier } from '../src/notification/shop-notifier.service';
import { NotificationOutboxRepository } from '../src/notification-outbox/notification-outbox.repository';
import { NotificationOutboxService } from '../src/notification-outbox/notification-outbox.service';
import { NOTIFICATION_OUTBOX_CLOCK } from '../src/notification-outbox/notification-outbox.clock';
import { NOTIFICATION_CHANNEL_ADAPTERS } from '../src/notification-outbox/channels/notification-channel-adapter';

const ROLLBACK = new Error('the order failed after the Telegram row was queued');

/**
 * The buyer's Telegram messages on a REAL Postgres (TASK-680, plan 187).
 *
 * What a mocked spec cannot see:
 *
 * - constraint #2 for the CUSTOMER rows: the confirmation queued inside
 *   `createFromCart`'s own transaction disappears with the order when the order
 *   fails — no message about an order that does not exist;
 * - owner decision 3 (2026-10-07): a guest's chat connected AFTER the order gets
 *   exactly ONE summary row, written by the token exchange's own transaction; a
 *   second press of a fresh link for the same chat and order creates no binding
 *   and so no second row; an account's binding gets nothing retroactive.
 *
 * Every row it creates is keyed to this run and deleted in `afterAll`.
 */
describe('CustomerNotifier (integration, TASK-680)', () => {
  let prisma: PrismaService;
  let orders: OrderRepository;
  let orderService: OrderService;
  let outboxRepository: NotificationOutboxRepository;
  let carts: CartRepository;
  let bindings: NotificationBindingService;
  let notifier: CustomerNotifier;

  const run = randomUUID().slice(0, 8);
  const chat = (name: string) => `int-cust-${run}-${name}`;
  const buyerEmail = `int-cust-${run}@test.local`;
  const tokens: string[] = [];
  const createdOrderIds: string[] = [];

  let userId = '';
  let categoryId = '';
  let productId = '';
  let cartId = '';

  beforeAll(async () => {
    const url = process.env.DATABASE_URL ?? '';
    if (!/test/i.test(url)) {
      throw new Error(`Refusing to run integration tests against a non-test database: "${url}"`);
    }

    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true })],
      providers: [
        PrismaService,
        OrderRepository,
        NotificationBindingRepository,
        NotificationBindingService,
        NotificationOutboxRepository,
        CustomerNotifier,
        // ─── The real checkout, for the order-transaction proof ────────────────
        // OrderService with its real repository, its real letter queue and the
        // real CustomerNotifier; the collaborators that do not write (delivery
        // pricing, add-ons, discounts, the shop ping) are stubs.
        OrderService,
        CartRepository,
        NotificationOutboxService,
        { provide: NOTIFICATION_CHANNEL_ADAPTERS, useValue: [] },
        { provide: NOTIFICATION_OUTBOX_CLOCK, useValue: { now: () => new Date() } },
        {
          provide: CartService,
          useFactory: (repository: CartRepository) => ({
            loadForCheckout: (identity: { userId: string }) =>
              repository.findByUserId(identity.userId),
          }),
          inject: [CartRepository],
        },
        {
          provide: UserRepository,
          useValue: {
            findById: jest.fn(async (id: string) => ({
              id,
              email: buyerEmail,
              firstName: 'Тарас',
              lastName: 'Шевченко',
              isActive: true,
            })),
          },
        },
        {
          provide: DeliveryService,
          useValue: {
            getMethodSettings: jest.fn().mockResolvedValue({
              enabledMethods: [DeliveryMethod.NOVA_POSHTA],
              courier: { price: '0', freeFrom: null },
            }),
            estimateShipping: jest.fn().mockResolvedValue({ cost: '60' }),
          },
        },
        {
          provide: AddonApplicabilityResolver,
          useValue: { resolveForProducts: async () => new Map() },
        },
        { provide: DiscountService, useValue: {} },
        { provide: OrderLookupRepository, useValue: {} },
        { provide: ShopNotifier, useValue: { enqueueNewOrder: jest.fn().mockResolvedValue(0) } },
        { provide: CacheService, useValue: { del: jest.fn(), delByPrefix: jest.fn() } },
        {
          provide: ProductIndexer,
          useValue: {
            index: jest.fn().mockResolvedValue(undefined),
            remove: jest.fn().mockResolvedValue(undefined),
          } satisfies ProductIndexer,
        },
        {
          provide: PinoLogger,
          useValue: { setContext: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() },
        },
      ],
    }).compile();

    prisma = moduleRef.get(PrismaService);
    orders = moduleRef.get(OrderRepository);
    orderService = moduleRef.get(OrderService);
    outboxRepository = moduleRef.get(NotificationOutboxRepository);
    carts = moduleRef.get(CartRepository);
    bindings = moduleRef.get(NotificationBindingService);
    notifier = moduleRef.get(CustomerNotifier);
    await prisma.$connect();

    const category = await prisma.category.create({
      data: { name: `cust-cat-${run}`, slug: `cust-cat-${run}` },
    });
    categoryId = category.id;
    const product = await prisma.product.create({
      data: {
        name: `cust-prod-${run}`,
        slug: `cust-prod-${run}`,
        price: new Prisma.Decimal('149.50'),
        stock: 10,
        categoryId,
      },
    });
    productId = product.id;
    userId = (
      await prisma.user.create({
        data: { email: buyerEmail, passwordHash: 'x' },
      })
    ).id;
  });

  afterAll(async () => {
    if (prisma) {
      await prisma.notificationOutbox.deleteMany({
        where: { recipientAddress: { startsWith: `int-cust-${run}-` } },
      });
      // The letters the real checkout queued (OrderService describe).
      await prisma.notificationOutbox.deleteMany({ where: { recipientAddress: buyerEmail } });
      await prisma.notificationBinding.deleteMany({
        where: { externalId: { startsWith: `int-cust-${run}-` } },
      });
      await prisma.notificationBindingToken.deleteMany({
        where: { tokenHash: { in: tokens.map(hashBindingToken) } },
      });
      if (createdOrderIds.length > 0) {
        await prisma.orderStatusHistory.deleteMany({
          where: { orderId: { in: createdOrderIds } },
        });
        await prisma.orderItem.deleteMany({ where: { orderId: { in: createdOrderIds } } });
        await prisma.order.deleteMany({ where: { id: { in: createdOrderIds } } });
      }
      if (userId) {
        await prisma.orderStatusHistory.deleteMany({ where: { order: { userId } } });
        await prisma.orderItem.deleteMany({ where: { order: { userId } } });
        await prisma.order.deleteMany({ where: { userId } });
      }
      if (cartId) await prisma.cart.deleteMany({ where: { id: cartId } });
      if (productId) await prisma.product.deleteMany({ where: { id: productId } });
      if (categoryId) await prisma.category.deleteMany({ where: { id: categoryId } });
      if (userId) await prisma.user.deleteMany({ where: { id: userId } });
      await prisma.$disconnect();
    }
  });

  const rowsFor = (externalId: string) =>
    prisma.notificationOutbox.findMany({
      where: { recipientAddress: externalId, channel: NotificationChannel.TELEGRAM },
      orderBy: { createdAt: 'asc' },
    });

  async function issue(owner: { userId: string } | { orderId: string }): Promise<string> {
    const { token } = await bindings.issueToken({
      channel: NotificationChannel.TELEGRAM,
      audience: NotificationAudience.CUSTOMER,
      ...owner,
    });
    tokens.push(token);
    return token;
  }

  /** A fresh cart of two units for the account. */
  async function buildParams(): Promise<CreateOrderParams> {
    if (cartId) await prisma.cart.deleteMany({ where: { id: cartId } });
    const cart = await prisma.cart.create({
      data: { userId, items: { create: [{ productId, quantity: 2 }] } },
      include: { items: { include: { product: true, addons: true } } },
    });
    cartId = cart.id;
    return {
      userId,
      cartId,
      cartItems: cart.items as unknown as CreateOrderParams['cartItems'],
      shippingAddress: {
        firstName: 'Тарас',
        lastName: 'Шевченко',
        address1: 'Нова Пошта, відділення №12',
        city: 'Київ',
        phone: '+380501234567',
      } as CreateOrderParams['shippingAddress'],
      shippingCost: 0,
      deliveryMethod: DeliveryMethod.NOVA_POSHTA,
    };
  }

  // ─── Constraint #2: the row lives and dies with the order ───────────────────

  describe('the confirmation queued in the order transaction', () => {
    const accountChat = chat('account');

    beforeAll(async () => {
      const bound = await bindings.consumeToken(await issue({ userId }), {
        id: accountChat,
        isPrivate: true,
      });
      if (!bound.ok) throw new Error('bind failed');
    });

    it('an account binding gets nothing retroactive when it is created', async () => {
      expect(await rowsFor(accountChat)).toHaveLength(0);
    });

    it('an order that fails after the enqueue leaves NO Telegram row (and no order)', async () => {
      const params = await buildParams();
      let failedOrderId: string | null = null;

      await expect(
        orders.createFromCart(params, async (tx, created) => {
          failedOrderId = created.id;
          await expect(
            notifier.enqueueOrderConfirmation(
              { orderId: created.id, total: created.total.toString(), itemsCount: 2 },
              { userId },
              tx,
            ),
          ).resolves.toBe(1);
          throw ROLLBACK;
        }),
      ).rejects.toBe(ROLLBACK);

      expect(failedOrderId).not.toBeNull();
      expect(await rowsFor(accountChat)).toHaveLength(0);
      await expect(prisma.order.findUnique({ where: { id: failedOrderId! } })).resolves.toBeNull();
    });

    it('an order that commits keeps exactly one row for the chat, owner stamped', async () => {
      const params = await buildParams();

      const created = await orders.createFromCart(params, async (tx, order) => {
        await notifier.enqueueOrderConfirmation(
          { orderId: order.id, total: order.total.toString(), itemsCount: 2 },
          { userId },
          tx,
        );
      });
      createdOrderIds.push(created.id);

      const rows = await rowsFor(accountChat);
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({
        type: 'order-confirmation',
        channel: NotificationChannel.TELEGRAM,
        payload: {
          orderId: created.id,
          orderNumber: created.id.slice(0, 8).toUpperCase(),
          // Prisma's Decimal string, as the shop ping carries it.
          total: expect.stringMatching(/^299(\.00?)?$/),
          itemsCount: 2,
          recipientOwner: { userId, orderId: created.id },
        },
      });
      await prisma.notificationOutbox.deleteMany({ where: { id: rows[0].id } });
    });

    // ─── The same proof through OrderService itself (TASK-680 review) ────────
    // The two cases above hand the repository their own callback, so they prove
    // that the notifier honours `tx` — not that the checkout wires it into the
    // order's transaction. These run the real `OrderService.createOrder`.

    const checkoutDto = {
      shippingAddress: {
        firstName: 'Тарас',
        lastName: 'Шевченко',
        address1: 'Нова Пошта, відділення №12',
        city: 'Київ',
        phone: '+380501234567',
        npCityRef: 'int-city-ref',
      },
      deliveryMethod: DeliveryMethod.NOVA_POSHTA,
    } as unknown as CreateOrderDto;

    it('OrderService: a failed Telegram insert takes the order AND its letter down with it', async () => {
      await buildParams(); // a fresh two-unit cart for the account
      const ordersBefore = await prisma.order.count({ where: { userId } });
      const written: string[] = [];
      const realEnqueue = outboxRepository.enqueue.bind(outboxRepository);
      const spy = jest.spyOn(outboxRepository, 'enqueue').mockImplementation(async (params, tx) => {
        // The row IS written — through the order's tx — and only then fails.
        const row = await realEnqueue(params, tx);
        written.push(params.channel ?? NotificationChannel.EMAIL);
        if (params.channel === NotificationChannel.TELEGRAM) throw ROLLBACK;
        return row;
      });

      try {
        await expect(orderService.createOrder({ type: 'user', userId }, checkoutDto)).rejects.toBe(
          ROLLBACK,
        );
      } finally {
        spy.mockRestore();
      }

      // Both rows were inserted before the failure…
      expect(written).toEqual([NotificationChannel.EMAIL, NotificationChannel.TELEGRAM]);
      // …and neither the order, nor the letter, nor the Telegram row survived.
      expect(await prisma.order.count({ where: { userId } })).toBe(ordersBefore);
      expect(
        await prisma.notificationOutbox.count({ where: { recipientAddress: buyerEmail } }),
      ).toBe(0);
      expect(await rowsFor(accountChat)).toHaveLength(0);
      // The cart is untouched: the buyer can simply press «Оформити» again.
      expect(await carts.findByUserId(userId)).toMatchObject({
        items: [expect.objectContaining({ quantity: 2 })],
      });
    });

    it('OrderService: a committed order has its letter AND one Telegram row for the chat', async () => {
      await buildParams();

      const order = await orderService.createOrder({ type: 'user', userId }, checkoutDto);
      createdOrderIds.push(order.id);

      const letters = await prisma.notificationOutbox.findMany({
        where: { recipientAddress: buyerEmail, type: 'order-confirmation' },
      });
      expect(letters).toHaveLength(1);
      expect(letters[0].channel).toBe(NotificationChannel.EMAIL);

      const rows = await rowsFor(accountChat);
      expect(rows).toHaveLength(1);
      expect(rows[0].payload).toMatchObject({
        orderId: order.id,
        itemsCount: 2,
        deliveryMethod: DeliveryMethod.NOVA_POSHTA,
        status: null,
      });
      await prisma.notificationOutbox.deleteMany({
        where: { id: { in: [letters[0].id, rows[0].id] } },
      });
    });
  });

  // ─── Owner decision 3: the guest's summary, once ────────────────────────────

  describe('the guest summary on connect', () => {
    let guestOrderId = '';

    beforeAll(async () => {
      const order = await prisma.order.create({
        data: {
          subtotal: new Prisma.Decimal('449.00'),
          total: new Prisma.Decimal('449.00'),
          shippingAddress: {},
          guestName: 'Гість',
          items: {
            create: [
              { productId, quantity: 2, price: new Prisma.Decimal('149.50') },
              { productId, quantity: 1, price: new Prisma.Decimal('150.00') },
            ],
          },
        },
      });
      guestOrderId = order.id;
      createdOrderIds.push(order.id);
    });

    it('creates exactly ONE summary row for the newly connected chat, in the exchange', async () => {
      const id = chat('guest');

      const bound = await bindings.consumeToken(await issue({ orderId: guestOrderId }), {
        id,
        isPrivate: true,
      });

      expect(bound).toMatchObject({ ok: true, created: true });
      const rows = await rowsFor(id);
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({
        type: 'order-confirmation',
        payload: {
          orderId: guestOrderId,
          orderNumber: guestOrderId.slice(0, 8).toUpperCase(),
          total: expect.stringMatching(/^449(\.00?)?$/),
          itemsCount: 3,
          // Read from the order at connect time — the renderer words the next step by them.
          deliveryMethod: DeliveryMethod.NOVA_POSHTA,
          status: OrderStatus.PENDING,
          recipientOwner: { userId: null, orderId: guestOrderId },
        },
      });
      // Small and safe: nothing that opens the order travels to the chat.
      expect(JSON.stringify(rows[0].payload)).not.toMatch(/token|guest|@/i);
    });

    it('a second link pressed in the same chat binds nothing new and queues nothing new', async () => {
      const id = chat('guest');

      const again = await bindings.consumeToken(await issue({ orderId: guestOrderId }), {
        id,
        isPrivate: true,
      });

      expect(again).toMatchObject({ ok: true, created: false });
      expect(await rowsFor(id)).toHaveLength(1);
    });

    it('a refused exchange (link opened in a group) queues nothing', async () => {
      const id = chat('guest-group');

      await expect(
        bindings.consumeToken(await issue({ orderId: guestOrderId }), { id, isPrivate: false }),
      ).resolves.toEqual({ ok: false, reason: 'private-only' });
      expect(await rowsFor(id)).toHaveLength(0);
    });

    it('then «відправлено» reaches that chat once, alongside any other chat of the order', async () => {
      const second = chat('guest-second');
      await bindings.consumeToken(await issue({ orderId: guestOrderId }), {
        id: second,
        isPrivate: true,
      });

      await expect(
        notifier.enqueueOrderShipped(
          {
            orderId: guestOrderId,
            trackingNumber: '20450000000001',
            deliveryMethod: 'NOVA_POSHTA',
          },
          { userId: null, orderId: guestOrderId },
        ),
      ).resolves.toBe(2);

      const shipped = await prisma.notificationOutbox.findMany({
        where: {
          type: 'order-shipped',
          recipientAddress: { in: [chat('guest'), second] },
        },
      });
      expect(shipped.map((row) => row.recipientAddress).sort()).toEqual(
        [chat('guest'), second].sort(),
      );
    });

    it('an order cancelled before the chat connected binds the chat but sends no «прийнято»', async () => {
      const cancelled = await prisma.order.create({
        data: {
          subtotal: new Prisma.Decimal('149.50'),
          total: new Prisma.Decimal('149.50'),
          shippingAddress: {},
          guestName: 'Гість',
          status: OrderStatus.CANCELLED,
          items: { create: [{ productId, quantity: 1, price: new Prisma.Decimal('149.50') }] },
        },
      });
      createdOrderIds.push(cancelled.id);
      const id = chat('guest-cancelled');

      const bound = await bindings.consumeToken(await issue({ orderId: cancelled.id }), {
        id,
        isPrivate: true,
      });

      expect(bound).toMatchObject({ ok: true, created: true });
      expect(await rowsFor(id)).toHaveLength(0);
    });
  });
});
