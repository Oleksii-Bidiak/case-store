import { ConfigModule } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import {
  NotificationChannel,
  OrderStatus,
  PaymentAttemptStatus,
  PaymentMethod,
  PaymentStatus,
  Prisma,
} from '@prisma/client';
import { randomUUID } from 'crypto';
import { CacheService } from '../src/cache';
import { OrderRepository } from '../src/order/order.repository';
import type { PaymentApplyPlan } from '../src/order/order.types';
import { PrismaService } from '../src/prisma';
import { ProductIndexer } from '../src/search/product-indexer';

/**
 * TASK-678 on real Postgres: the shop ping for an online order is written by
 * `applyPaymentOutcome`'s `onPaid` hook in the SAME transaction as the payment.
 *
 * What a mocked transaction cannot show:
 *
 * - both the payment and the outbox row really commit together;
 * - a hook that throws really takes the payment with it — the order is still
 *   unpaid, the attempt is still PENDING, and no outbox row exists — so the
 *   provider's retry (or the reconcile worker) finds it exactly as before.
 *
 * Every row this spec writes is keyed by a run id and removed in `afterAll`.
 */
describe('applyPaymentOutcome × the shop ping (integration, TASK-678)', () => {
  let prisma: PrismaService;
  let orders: OrderRepository;

  const run = randomUUID().slice(0, 8);
  const chat = `int-678-${run}`;
  let userId: string;
  const createdOrders: string[] = [];

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
        { provide: CacheService, useValue: { del: jest.fn(), delByPrefix: jest.fn() } },
        {
          provide: ProductIndexer,
          useValue: {
            index: jest.fn().mockResolvedValue(undefined),
            remove: jest.fn().mockResolvedValue(undefined),
          } satisfies ProductIndexer,
        },
      ],
    }).compile();

    prisma = moduleRef.get(PrismaService);
    orders = moduleRef.get(OrderRepository);
    await prisma.$connect();

    const user = await prisma.user.create({
      data: { email: `shop-ping-678-${run}@test.local`, passwordHash: 'x' },
    });
    userId = user.id;
  });

  afterAll(async () => {
    if (prisma) {
      await prisma.notificationOutbox.deleteMany({ where: { recipientAddress: chat } });
      await prisma.payment.deleteMany({ where: { orderId: { in: createdOrders } } });
      await prisma.orderStatusHistory.deleteMany({ where: { orderId: { in: createdOrders } } });
      await prisma.order.deleteMany({ where: { id: { in: createdOrders } } });
      await prisma.user.deleteMany({ where: { id: userId } });
      await prisma.$disconnect();
    }
  });

  /** A live, unpaid ONLINE order with one open payment attempt. */
  async function seed(): Promise<{ orderId: string; paymentId: string }> {
    const order = await prisma.order.create({
      data: {
        userId,
        status: OrderStatus.PENDING,
        paymentStatus: PaymentStatus.PENDING,
        paymentMethod: PaymentMethod.ONLINE,
        reservationExpiresAt: new Date(Date.now() + 30 * 60_000),
        subtotal: '1299.00',
        total: '1299.00',
      },
    });
    createdOrders.push(order.id);
    const payment = await prisma.payment.create({
      data: { orderId: order.id, provider: 'liqpay', amount: '1299.00', currency: 'UAH' },
    });
    return { orderId: order.id, paymentId: payment.id };
  }

  const successPlan = (orderId: string, paymentId: string): PaymentApplyPlan => {
    const now = new Date();
    return {
      paymentId,
      orderId,
      expected: { status: OrderStatus.PENDING, paymentStatus: PaymentStatus.PENDING },
      attemptStatus: PaymentAttemptStatus.SUCCEEDED,
      settledAt: now,
      failureCode: null,
      failureMessage: null,
      paymentStatusChange: { from: PaymentStatus.PENDING, to: PaymentStatus.PAID },
      paidAt: now,
      clearReservation: true,
      stockHold: 'held',
      statusChange: { from: OrderStatus.PENDING, to: OrderStatus.CONFIRMED },
    };
  };

  /** What the service's hook does, minus the recipient lookup: one TELEGRAM row via `tx`. */
  const writePing = async (tx: Prisma.TransactionClient, order: { id: string }) => {
    await tx.notificationOutbox.create({
      data: {
        type: 'shop-new-order',
        channel: NotificationChannel.TELEGRAM,
        recipientAddress: chat,
        payload: { orderId: order.id },
      },
    });
  };

  const pings = (orderId: string) =>
    prisma.notificationOutbox.findMany({
      where: { recipientAddress: chat, payload: { path: ['orderId'], equals: orderId } },
    });

  it('commits the payment and the ping together', async () => {
    const { orderId, paymentId } = await seed();

    await orders.applyPaymentOutcome(successPlan(orderId, paymentId), writePing);

    const order = await prisma.order.findUniqueOrThrow({ where: { id: orderId } });
    expect(order.paymentStatus).toBe(PaymentStatus.PAID);
    expect(order.status).toBe(OrderStatus.CONFIRMED);
    expect(await pings(orderId)).toHaveLength(1);
  });

  it('a hook that throws leaves the payment unapplied and no row behind', async () => {
    const { orderId, paymentId } = await seed();

    await expect(
      orders.applyPaymentOutcome(successPlan(orderId, paymentId), async (tx, order) => {
        await writePing(tx, order);
        throw new Error('ping failed after the insert');
      }),
    ).rejects.toThrow('ping failed after the insert');

    const order = await prisma.order.findUniqueOrThrow({ where: { id: orderId } });
    expect(order.paymentStatus).toBe(PaymentStatus.PENDING);
    expect(order.status).toBe(OrderStatus.PENDING);
    expect(order.reservationExpiresAt).not.toBeNull();
    const attempt = await prisma.payment.findUniqueOrThrow({ where: { id: paymentId } });
    expect(attempt.status).toBe(PaymentAttemptStatus.PENDING);
    expect(await pings(orderId)).toHaveLength(0);
    expect(await prisma.orderStatusHistory.count({ where: { orderId } })).toBe(0);
  });
});
