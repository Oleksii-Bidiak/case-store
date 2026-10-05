import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';
import {
  OrderStatus,
  PaymentAttemptStatus,
  PaymentMethod,
  PaymentStatus,
  Prisma,
  type NotificationOutbox,
} from '@prisma/client';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { AuthRepository } from '../src/auth/auth.repository';
import { PermissionRepository } from '../src/auth/permissions';
import { renderShopNewOrder } from '../src/notification/telegram/templates/shop-new-order';
import { signLiqPayData } from '../src/payment/adapters/liqpay/liqpay.signature';
import { PrismaService } from '../src/prisma';
import { createPermissionRepositoryMock } from './permission-repository.mock';

/**
 * E2E: the shop hears about an ONLINE order when LiqPay confirms the money, not
 * when it was placed (TASK-678, owner decision B-7 №7 in plan 178).
 *
 * The checkout half — no shop row at creation for ONLINE/INSTALLMENTS, a row for
 * ON_DELIVERY — lives in `order.e2e-spec.ts` next to its checkout fixture. This
 * file plays the payment half through the real chain: the LiqPay adapter's
 * signature check, PaymentService (the PaymentEvent idempotency claim and its
 * release), OrderService, OrderRepository, ShopNotifier, the binding lookup and
 * the outbox repository. Only `PrismaService` is a double.
 *
 * The double keeps a little state so the guarantees are visible rather than
 * assumed:
 *
 * - the PaymentEvent unique index — a second insert of the same
 *   (paymentId, providerStatus, providerPaymentId) throws P2002, like Postgres;
 * - the transaction — every write made through `tx` is staged and becomes real
 *   only if the callback resolves. A rejected callback discards them, which is
 *   what "rolls back" means here, and `tx` is a different object from the base
 *   client, so a ping written outside the transaction would land on the wrong spy;
 * - the conditional order write — `updateMany` matches on the statuses the plan
 *   was decided against, against the CURRENT committed row.
 *
 * No real database is involved.
 */

class ThrottlerGuardPassThrough extends ThrottlerGuard {
  protected async handleRequest(): Promise<boolean> {
    return true;
  }
}

const PAYMENT_ID = '550e8400-e29b-41d4-a716-446655440678';
const ORDER_ID = '550e8400-e29b-41d4-a716-4466554406bb';
const USER_ID = '550e8400-e29b-41d4-a716-4466554406cc';
const SHOP_CHAT_ID = '-1006780000000';
const CHARGED = '1299.00';

interface OrderState {
  status: OrderStatus;
  paymentStatus: PaymentStatus;
  paymentMethod: PaymentMethod;
  paidAt: Date | null;
  reservationExpiresAt: Date | null;
}

describe('Shop ping on a confirmed online payment (e2e, TASK-678)', () => {
  let app: INestApplication;
  let privateKey: string;

  // ── The committed "database" ─────────────────────────────────────────────
  let order: OrderState;
  let eventKeys: Map<string, string>;
  let committedRows: Array<Record<string, unknown>>;

  // ── The writes staged by the transaction in flight ─────────────────────
  let stagedOrder: Partial<OrderState> | null;
  let stagedRows: Array<Record<string, unknown>>;

  const tx = {
    payment: { update: jest.fn() },
    order: { updateMany: jest.fn(), update: jest.fn(), findUniqueOrThrow: jest.fn() },
    orderItem: { findMany: jest.fn() },
    product: { updateMany: jest.fn(), update: jest.fn() },
    orderStatusHistory: { create: jest.fn() },
    notificationBinding: { findMany: jest.fn() },
    notificationOutbox: { create: jest.fn() },
  };

  const prismaServiceMock = {
    $connect: jest.fn(),
    $disconnect: jest.fn(),
    $on: jest.fn(),
    $transaction: jest.fn(),
    payment: { findUnique: jest.fn(), update: jest.fn() },
    paymentEvent: { create: jest.fn(), delete: jest.fn() },
    user: { findFirst: jest.fn() },
    // Must never be written: a ping on the base client would commit even when
    // the payment rolled back.
    notificationOutbox: { create: jest.fn() },
  };

  /** One row serves PaymentRepository.findById and OrderRepository.findPaymentWithOrder. */
  const paymentRow = () => ({
    id: PAYMENT_ID,
    orderId: ORDER_ID,
    provider: 'liqpay',
    providerPaymentId: null,
    amount: new Prisma.Decimal(CHARGED),
    refundedAmount: new Prisma.Decimal(0),
    currency: 'UAH',
    status: PaymentAttemptStatus.PENDING,
    failureCode: null,
    failureMessage: null,
    settledAt: null,
    createdAt: new Date('2026-10-01T10:00:00.000Z'),
    updatedAt: new Date('2026-10-01T10:00:00.000Z'),
    order: {
      id: ORDER_ID,
      userId: USER_ID,
      restockedAt: null,
      ...order,
    },
  });

  /** The full order the repository re-reads inside the transaction. */
  const fullOrder = () => ({
    id: ORDER_ID,
    userId: USER_ID,
    guestName: null,
    restockedAt: null,
    deliveryMethod: 'NOVA_POSHTA',
    total: new Prisma.Decimal(CHARGED),
    shippingAddress: { firstName: 'Отримувач', lastName: 'Посилки', city: 'Львів' },
    items: [
      {
        id: 'line-1',
        orderId: ORDER_ID,
        productId: 'product-1',
        quantity: 2,
        price: new Prisma.Decimal('649.50'),
        createdAt: new Date('2026-10-01T10:00:00.000Z'),
        product: { id: 'product-1', name: 'Case', slug: 'case', images: [] },
        addons: [],
      },
    ],
    ...order,
    ...(stagedOrder ?? {}),
  });

  const successCallback = (liqpayPaymentId = 678) => {
    const data = Buffer.from(
      JSON.stringify({
        order_id: PAYMENT_ID,
        status: 'success',
        payment_id: liqpayPaymentId,
        amount: CHARGED,
        currency: 'UAH',
      }),
    ).toString('base64');
    return { data, signature: signLiqPayData(data, privateKey) };
  };

  const url = '/api/payments/liqpay/callback';

  beforeAll(async () => {
    process.env.LIQPAY_PUBLIC_KEY = process.env.LIQPAY_PUBLIC_KEY || 'sandbox_i000000e2e';
    process.env.LIQPAY_PRIVATE_KEY =
      process.env.LIQPAY_PRIVATE_KEY || 'sandbox_e2e_private_key_for_task_678';

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

  const seedOrder = (paymentMethod: PaymentMethod, status: OrderStatus = OrderStatus.PENDING) => {
    order = {
      status,
      paymentStatus: PaymentStatus.PENDING,
      paymentMethod,
      paidAt: null,
      reservationExpiresAt:
        paymentMethod === PaymentMethod.ON_DELIVERY ? null : new Date('2026-10-01T10:30:00.000Z'),
    };
  };

  beforeEach(() => {
    jest.clearAllMocks();
    seedOrder(PaymentMethod.ONLINE);
    eventKeys = new Map();
    committedRows = [];
    stagedOrder = null;
    stagedRows = [];

    prismaServiceMock.payment.findUnique.mockImplementation(async () => paymentRow());
    prismaServiceMock.payment.update.mockResolvedValue({});
    prismaServiceMock.user.findFirst.mockResolvedValue({
      id: USER_ID,
      firstName: 'Олена',
      lastName: 'Шевченко',
    });

    // The PaymentEvent unique index (paymentId, providerStatus, providerPaymentId).
    prismaServiceMock.paymentEvent.create.mockImplementation(
      async ({ data }: { data: Record<string, unknown> }) => {
        const key = `${String(data.paymentId)}|${String(data.providerStatus)}|${String(data.providerPaymentId)}`;
        if ([...eventKeys.values()].includes(key)) {
          throw new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
            code: 'P2002',
            clientVersion: 'e2e',
          });
        }
        const id = `evt-${eventKeys.size + 1}`;
        eventKeys.set(id, key);
        return { id };
      },
    );
    prismaServiceMock.paymentEvent.delete.mockImplementation(
      async ({ where }: { where: { id: string } }) => {
        eventKeys.delete(where.id);
        return {};
      },
    );

    // The transaction: staged writes become real only if the callback resolves.
    prismaServiceMock.$transaction.mockImplementation(
      async (fn: (client: typeof tx) => Promise<unknown>) => {
        stagedOrder = null;
        stagedRows = [];
        try {
          const result = await fn(tx);
          // `fn` stages through the tx mock, which control-flow analysis cannot see —
          // it still narrows `stagedOrder` to the `null` assigned above.
          const staged = stagedOrder as Partial<OrderState> | null;
          if (staged) order = { ...order, ...staged };
          committedRows.push(...stagedRows);
          return result;
        } finally {
          stagedOrder = null;
          stagedRows = [];
        }
      },
    );

    tx.payment.update.mockResolvedValue({});
    tx.order.updateMany.mockImplementation(
      async ({
        where,
        data,
      }: {
        where: { status: OrderStatus; paymentStatus: PaymentStatus };
        data: Partial<OrderState>;
      }) => {
        const matches =
          where.status === order.status && where.paymentStatus === order.paymentStatus;
        if (matches) stagedOrder = { ...(stagedOrder ?? {}), ...data };
        return { count: matches ? 1 : 0 };
      },
    );
    tx.order.findUniqueOrThrow.mockImplementation(async () => fullOrder());
    tx.orderStatusHistory.create.mockResolvedValue({});
    tx.notificationBinding.findMany.mockResolvedValue([
      {
        id: 'binding-1',
        channel: 'TELEGRAM',
        audience: 'SHOP',
        externalId: SHOP_CHAT_ID,
        label: null,
        userId: null,
        orderId: null,
        createdAt: new Date('2026-10-01T09:00:00.000Z'),
        revokedAt: null,
      },
    ]);
    tx.notificationOutbox.create.mockImplementation(
      async ({ data }: { data: Record<string, unknown> }) => {
        stagedRows.push(data);
        return { id: `outbox-${stagedRows.length}` };
      },
    );
  });

  const shopRows = () => committedRows.filter((row) => row.type === 'shop-new-order');

  it('queues exactly one TELEGRAM row when the success callback lands, through the payment transaction', async () => {
    await request(app.getHttpServer())
      .post(url)
      .send(successCallback())
      .expect(200, { data: { received: true } });

    expect(order.paymentStatus).toBe(PaymentStatus.PAID);
    expect(shopRows()).toEqual([
      {
        type: 'shop-new-order',
        channel: 'TELEGRAM',
        recipientAddress: SHOP_CHAT_ID,
        payload: {
          orderId: ORDER_ID,
          // Prisma.Decimal's own toString — the template formats it.
          total: new Prisma.Decimal(CHARGED).toString(),
          paymentMethod: PaymentMethod.ONLINE,
          deliveryMethod: 'NOVA_POSHTA',
          itemsCount: 2,
          // The account's name, as the checkout ping would have printed it.
          customerName: 'Олена Шевченко',
          city: 'Львів',
        },
      },
    ]);
    expect(prismaServiceMock.notificationOutbox.create).not.toHaveBeenCalled();

    // What the owner reads: the method and the sum (check SYS-50).
    const text = renderShopNewOrder(shopRows()[0] as unknown as NotificationOutbox, {
      adminUrl: () => null,
    });
    expect(text).toContain('Оплата: картка онлайн');
    expect(text).toMatch(/Сума: 1\s?299/);
  });

  it('a replayed callback is a duplicate claim — still one row', async () => {
    await request(app.getHttpServer()).post(url).send(successCallback()).expect(200);
    await request(app.getHttpServer()).post(url).send(successCallback()).expect(200);

    expect(shopRows()).toHaveLength(1);
    // The replay never reached the order: the unique index answered first.
    expect(prismaServiceMock.$transaction).toHaveBeenCalledTimes(1);
  });

  it('a second, distinct success on a paid order (e.g. the reconcile worker) adds no row', async () => {
    await request(app.getHttpServer()).post(url).send(successCallback(678)).expect(200);
    // A different LiqPay payment_id → a different PaymentEvent key, so the claim
    // passes; the order is already PAID, so there is nothing to apply.
    await request(app.getHttpServer()).post(url).send(successCallback(679)).expect(200);

    expect(eventKeys.size).toBe(2);
    expect(shopRows()).toHaveLength(1);
  });

  it('INSTALLMENTS is announced on payment as well', async () => {
    seedOrder(PaymentMethod.INSTALLMENTS);

    await request(app.getHttpServer()).post(url).send(successCallback()).expect(200);

    expect(shopRows()).toEqual([
      expect.objectContaining({
        payload: expect.objectContaining({ paymentMethod: PaymentMethod.INSTALLMENTS }),
      }),
    ]);
  });

  it('an ON_DELIVERY order paid online is not announced again — it was at checkout', async () => {
    seedOrder(PaymentMethod.ON_DELIVERY);

    await request(app.getHttpServer()).post(url).send(successCallback()).expect(200);

    expect(order.paymentStatus).toBe(PaymentStatus.PAID);
    expect(tx.notificationBinding.findMany).not.toHaveBeenCalled();
    expect(shopRows()).toHaveLength(0);
  });

  it('a success on a CANCELLED order (PAID_AFTER_CANCEL) records the money and pings nobody', async () => {
    seedOrder(PaymentMethod.ONLINE, OrderStatus.CANCELLED);

    await request(app.getHttpServer()).post(url).send(successCallback()).expect(200);

    expect(order.paymentStatus).toBe(PaymentStatus.PAID);
    expect(order.status).toBe(OrderStatus.CANCELLED);
    expect(tx.notificationBinding.findMany).not.toHaveBeenCalled();
    expect(shopRows()).toHaveLength(0);
  });

  it('a failed ping rolls the payment back and releases the claim; the retry applies both', async () => {
    tx.notificationOutbox.create.mockRejectedValueOnce(new Error('outbox insert failed'));

    // The callback fails loudly (not a 200), so the provider retries it…
    await request(app.getHttpServer()).post(url).send(successCallback()).expect(500);
    expect(order.paymentStatus).toBe(PaymentStatus.PENDING);
    expect(shopRows()).toHaveLength(0);
    // …and the idempotency claim was given back, so the retry is not a "duplicate".
    expect(prismaServiceMock.paymentEvent.delete).toHaveBeenCalledTimes(1);
    expect(eventKeys.size).toBe(0);

    await request(app.getHttpServer()).post(url).send(successCallback()).expect(200);

    expect(order.paymentStatus).toBe(PaymentStatus.PAID);
    expect(shopRows()).toHaveLength(1);
  });
});
