import { ConfigModule } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import {
  OrderHistoryChangeType,
  OrderHistoryNote,
  OrderStatus,
  PaymentStatus,
} from '@prisma/client';
import { randomUUID } from 'crypto';
import { ProductsReportRepository } from '../src/analytics/reports/products-report.repository';
import { SalesRepository } from '../src/analytics/reports/sales.repository';
import { CacheService } from '../src/cache';
import { DashboardRepository } from '../src/dashboard/dashboard.repository';
import { OrderRepository } from '../src/order/order.repository';
import { PrismaService } from '../src/prisma';
import { ProductIndexer } from '../src/search/product-indexer';

/**
 * TASK-352 (c), decision B-11 №3 — «Оплачено після скасування» on real Postgres.
 *
 * A late LiqPay success on an order the TTL worker already cancelled leaves the
 * order CANCELLED with the money PAID and a PAID_AFTER_CANCEL history row
 * (TASK-619). The dashboard tile counts such orders, and its deep link opens the
 * order list filtered by `paidAfterCancel`. The two are written separately (no
 * dashboard→order import), so this proves on a real query that they select the
 * SAME rows — and that an order the operator already dealt with (revived, or
 * refunded) drops out of both.
 *
 * The dashboard counts the whole table, so the tile is asserted as a DELTA over
 * a baseline taken before seeding rather than by wiping other suites' rows.
 */
describe('«Оплачено після скасування»: dashboard tile × order list filter (integration)', () => {
  let prisma: PrismaService;
  let dashboard: DashboardRepository;
  let orders: OrderRepository;

  let userId: string;
  const created: string[] = [];

  beforeAll(async () => {
    const url = process.env.DATABASE_URL ?? '';
    if (!/test/i.test(url)) {
      throw new Error(`Refusing to run integration tests against a non-test database: "${url}"`);
    }

    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true })],
      providers: [
        PrismaService,
        DashboardRepository,
        // The dashboard reads the reports' queries (TASK-688/694).
        ProductsReportRepository,
        SalesRepository,
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
    dashboard = moduleRef.get(DashboardRepository);
    orders = moduleRef.get(OrderRepository);
    await prisma.$connect();

    const user = await prisma.user.create({
      data: {
        email: `paid-after-cancel-${randomUUID().slice(0, 8)}@test.local`,
        passwordHash: 'x',
      },
    });
    userId = user.id;
  });

  afterAll(async () => {
    if (prisma) {
      await prisma.orderStatusHistory.deleteMany({ where: { orderId: { in: created } } });
      await prisma.order.deleteMany({ where: { id: { in: created } } });
      await prisma.user.deleteMany({ where: { id: userId } });
      await prisma.$disconnect();
    }
  });

  async function seed(
    status: OrderStatus,
    paymentStatus: PaymentStatus,
    note: OrderHistoryNote | null,
  ): Promise<string> {
    const order = await prisma.order.create({
      data: { userId, status, paymentStatus, subtotal: '100.00', total: '100.00' },
    });
    created.push(order.id);
    await prisma.orderStatusHistory.create({
      data: {
        orderId: order.id,
        changeType: OrderHistoryChangeType.PAYMENT_STATUS,
        fromPaymentStatus: PaymentStatus.PENDING,
        toPaymentStatus: PaymentStatus.PAID,
        changedBy: null,
        ...(note ? { note } : {}),
      },
    });
    return order.id;
  }

  it('counts and lists exactly the late-paid orders still cancelled', async () => {
    const before = (await dashboard.getNeedsAction()).paidAfterCancel;

    const pending = await seed(
      OrderStatus.CANCELLED,
      PaymentStatus.PAID,
      OrderHistoryNote.PAID_AFTER_CANCEL,
    );
    // Dealt with: the operator revived it (re-reserved) — no longer cancelled.
    await seed(OrderStatus.CONFIRMED, PaymentStatus.PAID, OrderHistoryNote.PAID_AFTER_CANCEL);
    // Dealt with: the operator refunded it — the money is no longer held.
    await seed(OrderStatus.CANCELLED, PaymentStatus.REFUNDED, OrderHistoryNote.PAID_AFTER_CANCEL);
    // Cancelled and paid, but never through the late-payment path.
    await seed(OrderStatus.CANCELLED, PaymentStatus.PAID, null);

    const after = (await dashboard.getNeedsAction()).paidAfterCancel;
    expect(after - before).toBe(1);

    const listed = await orders.findAll({ userId, paidAfterCancel: true, limit: 50 });
    expect(listed.total).toBe(1);
    expect(listed.orders.map((order) => order.id)).toEqual([pending]);
  });
});
