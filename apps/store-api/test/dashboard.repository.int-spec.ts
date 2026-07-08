import { INestApplication } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { randomUUID } from 'crypto';
import {
  MailOutboxStatus,
  OrderStatus,
  PaymentStatus,
  OrderHistoryChangeType,
} from '@prisma/client';
import { DashboardRepository } from '../src/dashboard/dashboard.repository';
import { LOW_STOCK_THRESHOLD } from '../src/dashboard/dashboard.types';
import { PrismaService } from '../src/prisma';

/**
 * Integration tests for DashboardRepository — run the REAL repository against a
 * REAL Postgres instance (no mocks). These exercise the raw `$queryRaw` SQL the
 * mocked e2e suite (dashboard.e2e-spec.ts) cannot reach: the `generate_series`
 * gap-fill, the `SUM(price * quantity)` top-products arithmetic, and — since
 * TASK-152 — the `payment_status = 'PAID'` revenue filter (orders are counted as
 * revenue only once the admin marks them PAID, after TASK-151 decoupled payment
 * from order status). Post-TASK-142 stock lives on `Product` (no ProductVariant).
 *
 * Requires an isolated `*_test` database; DATABASE_URL is forced to it by
 * setup-int.ts. Run with `npm run test:int -w apps/store-api` (DB up + migrated).
 *
 * NOTE: dashboard metrics aggregate the whole database, so beforeAll clears all
 * orders/order-items first to make the revenue assertions deterministic.
 */
describe('DashboardRepository (integration)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let repo: DashboardRepository;

  let categoryId: string;
  let userId: string;
  let paidProductId: string; // low stock + appears in a PAID order
  let unpaidProductId: string; // healthy stock + appears only in a PENDING (unpaid) order
  let cancelledProductId: string; // healthy stock + appears only in a CANCELLED order
  let soldOutProductId: string; // stock 0, active — must appear at the top of low-stock (TASK-253)

  // Only the PAID order counts toward revenue: qty 3 @ $10 = $30.
  const EXPECTED_TOP_REVENUE = 30;

  beforeAll(async () => {
    const url = process.env.DATABASE_URL ?? '';
    if (!/test/i.test(url)) {
      throw new Error(`Refusing to run integration tests against a non-test database: "${url}"`);
    }

    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true })],
      providers: [PrismaService, DashboardRepository],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();

    prisma = moduleRef.get(PrismaService);
    repo = moduleRef.get(DashboardRepository);

    // Deterministic revenue aggregates: start from zero orders.
    await prisma.orderItem.deleteMany({});
    await prisma.order.deleteMany({});

    const suffix = randomUUID();

    const category = await prisma.category.create({
      data: { name: 'Dash Category', slug: `dash-cat-${suffix}` },
    });
    categoryId = category.id;

    const user = await prisma.user.create({
      data: { email: `dash-${suffix}@test.local`, passwordHash: 'x' },
    });
    userId = user.id;

    // Low-stock product, sold in a PAID order → appears in top-products + low-stock.
    const paidProduct = await prisma.product.create({
      data: {
        name: 'Dash Paid Product',
        slug: `dash-paid-${suffix}`,
        price: '10.00',
        categoryId,
        stock: LOW_STOCK_THRESHOLD - 2, // e.g. 3 — below threshold
      },
    });
    paidProductId = paidProduct.id;

    // Healthy product, only ever in an unpaid (PENDING) order → must NOT appear
    // in top-products after the TASK-152 paid-only filter.
    const unpaidProduct = await prisma.product.create({
      data: {
        name: 'Dash Unpaid Product',
        slug: `dash-unpaid-${suffix}`,
        price: '20.00',
        categoryId,
        stock: LOW_STOCK_THRESHOLD + 50, // well above threshold
      },
    });
    unpaidProductId = unpaidProduct.id;

    // Healthy product, only in a CANCELLED order → never counts.
    const cancelledProduct = await prisma.product.create({
      data: {
        name: 'Dash Cancelled Product',
        slug: `dash-cancel-${suffix}`,
        price: '20.00',
        categoryId,
        stock: LOW_STOCK_THRESHOLD + 50,
      },
    });
    cancelledProductId = cancelledProduct.id;

    // Sold-out product (stock 0, active, non-deleted) — the most urgent restock
    // signal. Must appear in low-stock and, via ascending order, sort first
    // (TASK-253: dropped the old `stock > 0` filter).
    const soldOutProduct = await prisma.product.create({
      data: {
        name: 'Dash Sold Out Product',
        slug: `dash-soldout-${suffix}`,
        price: '15.00',
        categoryId,
        stock: 0,
      },
    });
    soldOutProductId = soldOutProduct.id;

    // PAID order for the paid product (DELIVERED + PAID): qty 3 @ $10 = $30.
    await prisma.order.create({
      data: {
        userId,
        status: OrderStatus.DELIVERED,
        paymentStatus: PaymentStatus.PAID,
        subtotal: '30.00',
        total: '30.00',
        items: { create: [{ productId: paidProductId, quantity: 3, price: '10.00' }] },
      },
    });

    // CONFIRMED but UNPAID order (TASK-151: status advanced, payment still PENDING):
    // must NOT count toward revenue or top-products.
    await prisma.order.create({
      data: {
        userId,
        status: OrderStatus.CONFIRMED,
        paymentStatus: PaymentStatus.PENDING,
        subtotal: '40.00',
        total: '40.00',
        items: { create: [{ productId: unpaidProductId, quantity: 2, price: '20.00' }] },
      },
    });

    // CANCELLED order — must never count.
    await prisma.order.create({
      data: {
        userId,
        status: OrderStatus.CANCELLED,
        paymentStatus: PaymentStatus.PENDING,
        subtotal: '100.00',
        total: '100.00',
        items: { create: [{ productId: cancelledProductId, quantity: 5, price: '20.00' }] },
      },
    });
  });

  afterAll(async () => {
    if (!prisma) {
      return;
    }
    await prisma.orderItem.deleteMany({});
    await prisma.order.deleteMany({});
    await prisma.product.deleteMany({
      where: {
        id: { in: [paidProductId, unpaidProductId, cancelledProductId, soldOutProductId] },
      },
    });
    await prisma.category.deleteMany({ where: { id: categoryId } });
    await prisma.user.deleteMany({ where: { id: userId } });
    await app.close();
  });

  describe('getSummary — top products', () => {
    it('uses SUM(price * quantity) and counts only PAID orders (TASK-152)', async () => {
      const summary = await repo.getSummary();
      const { topProducts } = summary.products;

      const top = topProducts.find((p) => p.productId === paidProductId);
      expect(top).toBeDefined();
      // 3 * $10 from the PAID order only — the PENDING order is excluded.
      expect(top?.totalRevenue).toBe(EXPECTED_TOP_REVENUE);

      // A product whose only order is CONFIRMED-but-UNPAID must not appear.
      expect(topProducts.find((p) => p.productId === unpaidProductId)).toBeUndefined();
      // A product whose only order is CANCELLED must not appear.
      expect(topProducts.find((p) => p.productId === cancelledProductId)).toBeUndefined();
    });
  });

  describe('getSummary — revenue series gap-fill', () => {
    it('returns a full 30-point series with today summing the PAID orders only', async () => {
      const summary = await repo.getSummary();
      const series = summary.revenue.revenueByDay;

      // generate_series always yields the full window.
      expect(series).toHaveLength(30);

      // Today is the last (ascending) bucket — PAID order only (no unpaid/cancelled).
      expect(series[series.length - 1].value).toBe(EXPECTED_TOP_REVENUE);

      // At least one earlier day has no orders → gap-filled to 0.
      expect(series.some((point) => point.value === 0)).toBe(true);
    });
  });

  describe('getSummary — unrealized revenue', () => {
    it('sums Order.total for active unpaid orders only, leaving earned revenue untouched (TASK-137)', async () => {
      const summary = await repo.getSummary();
      const { revenue } = summary;

      // Only the CONFIRMED + PENDING order (qty 2 @ $20 = $40) is unrealized.
      // The DELIVERED + PAID order is earned, the CANCELLED order is neither.
      expect(revenue.unrealizedRevenue).toBe(40);

      // The unpaid order was created today → inside the 30-day window.
      expect(revenue.unrealizedRevenueLast30Days).toBe(40);

      // Earned revenue (PAID only) must stay at $30 — not polluted by unrealized.
      expect(revenue.totalRevenue).toBe(EXPECTED_TOP_REVENUE);
    });
  });

  describe('getSummary — low stock', () => {
    it('includes products at/below the threshold (incl. sold-out), excludes healthy stock, ordered ascending', async () => {
      const summary = await repo.getSummary();
      const products = summary.inventory.lowStockProducts;

      expect(products.find((p) => p.productId === paidProductId)).toBeDefined();
      // Sold-out (stock 0) products now appear (TASK-253 dropped the `gt: 0` filter).
      const soldOut = products.find((p) => p.productId === soldOutProductId);
      expect(soldOut).toBeDefined();
      expect(soldOut?.stock).toBe(0);
      expect(products.find((p) => p.productId === unpaidProductId)).toBeUndefined();
      expect(products.find((p) => p.productId === cancelledProductId)).toBeUndefined();

      const stocks = products.map((p) => p.stock);
      const sorted = [...stocks].sort((a, b) => a - b);
      expect(stocks).toEqual(sorted);

      // The sold-out row sorts before every stock > 0 row (ascending on stock).
      const soldOutIndex = products.findIndex((p) => p.productId === soldOutProductId);
      const positiveStockIndexes = products
        .map((p, i) => ({ stock: p.stock, i }))
        .filter((r) => r.stock > 0)
        .map((r) => r.i);
      for (const idx of positiveStockIndexes) {
        expect(soldOutIndex).toBeLessThan(idx);
      }
    });
  });

  /**
   * Average order value (TASK-249): earned revenue in the 30-day window divided
   * by the number of PAID orders in that window. Seeds a deterministic set of
   * PAID orders (plus an unpaid order that must be ignored), then verifies the
   * divide-by-zero guard by clearing every order.
   */
  describe('getSummary — average order value', () => {
    beforeAll(async () => {
      await prisma.orderItem.deleteMany({});
      await prisma.order.deleteMany({});

      // Two PAID orders in the window: $100 + $50 = $150 over 2 orders → AOV $75.
      await prisma.order.create({
        data: {
          userId,
          status: OrderStatus.DELIVERED,
          paymentStatus: PaymentStatus.PAID,
          subtotal: '100.00',
          total: '100.00',
        },
      });
      await prisma.order.create({
        data: {
          userId,
          status: OrderStatus.DELIVERED,
          paymentStatus: PaymentStatus.PAID,
          subtotal: '50.00',
          total: '50.00',
        },
      });
      // An unpaid order must NOT inflate the count or revenue.
      await prisma.order.create({
        data: {
          userId,
          status: OrderStatus.PENDING,
          paymentStatus: PaymentStatus.PENDING,
          subtotal: '999.00',
          total: '999.00',
        },
      });
    });

    it('divides window revenue by the paid-order count ($150 / 2 = $75)', async () => {
      const summary = await repo.getSummary();
      expect(summary.revenue.averageOrderValueLast30Days).toBe(75);
    });

    it('returns 0 (no divide-by-zero) when there are no paid orders in the window', async () => {
      await prisma.order.deleteMany({});
      const summary = await repo.getSummary();
      expect(summary.revenue.averageOrderValueLast30Days).toBe(0);
    });
  });

  /**
   * Repeat-buyer rate (TASK-249): the share of customers with 2+ non-CANCELLED
   * orders. CANCELLED orders are excluded from the count; the 90-day variant
   * windows both numerator and denominator to orders created in the last 90 days.
   */
  describe('getSummary — repeat buyer rate', () => {
    let repeatUserId: string;
    let mixedUserId: string;
    let singleUserId: string;

    beforeAll(async () => {
      await prisma.orderItem.deleteMany({});
      await prisma.order.deleteMany({});

      const suffix = randomUUID();
      const repeatUser = await prisma.user.create({
        data: { email: `repeat-${suffix}@test.local`, passwordHash: 'x' },
      });
      const mixedUser = await prisma.user.create({
        data: { email: `mixed-${suffix}@test.local`, passwordHash: 'x' },
      });
      const singleUser = await prisma.user.create({
        data: { email: `single-${suffix}@test.local`, passwordHash: 'x' },
      });
      repeatUserId = repeatUser.id;
      mixedUserId = mixedUser.id;
      singleUserId = singleUser.id;

      const ninetyOneDaysAgo = new Date();
      ninetyOneDaysAgo.setDate(ninetyOneDaysAgo.getDate() - 91);

      // Repeat buyer: two non-CANCELLED orders, but the SECOND one is backdated
      // > 90 days so it falls out of the 90-day window (createdAt has no
      // @updatedAt auto-touch, so an explicit past date sticks).
      await prisma.order.create({
        data: {
          userId: repeatUserId,
          status: OrderStatus.DELIVERED,
          paymentStatus: PaymentStatus.PAID,
          subtotal: '10.00',
          total: '10.00',
        },
      });
      await prisma.order.create({
        data: {
          userId: repeatUserId,
          status: OrderStatus.DELIVERED,
          paymentStatus: PaymentStatus.PAID,
          subtotal: '10.00',
          total: '10.00',
          createdAt: ninetyOneDaysAgo,
        },
      });

      // Mixed buyer: 1 non-CANCELLED + 1 CANCELLED → only 1 real order, NOT a repeat.
      await prisma.order.create({
        data: {
          userId: mixedUserId,
          status: OrderStatus.CONFIRMED,
          paymentStatus: PaymentStatus.PENDING,
          subtotal: '10.00',
          total: '10.00',
        },
      });
      await prisma.order.create({
        data: {
          userId: mixedUserId,
          status: OrderStatus.CANCELLED,
          paymentStatus: PaymentStatus.PENDING,
          subtotal: '10.00',
          total: '10.00',
        },
      });

      // Single buyer: exactly one order, NOT a repeat.
      await prisma.order.create({
        data: {
          userId: singleUserId,
          status: OrderStatus.DELIVERED,
          paymentStatus: PaymentStatus.PAID,
          subtotal: '10.00',
          total: '10.00',
        },
      });
    });

    afterAll(async () => {
      await prisma.order.deleteMany({});
      await prisma.user.deleteMany({
        where: { id: { in: [repeatUserId, mixedUserId, singleUserId] } },
      });
    });

    it('counts only customers with 2+ non-CANCELLED orders all-time (1 of 3 = 1/3)', async () => {
      const summary = await repo.getSummary();
      // repeatUser (2 non-cancelled) is the only repeat buyer; mixedUser's
      // CANCELLED order is excluded, leaving 1 real order; singleUser has 1.
      expect(summary.customers.repeatBuyerRate).toBeCloseTo(1 / 3, 5);
    });

    it('windows the 90-day rate so a backdated second order no longer counts', async () => {
      const summary = await repo.getSummary();
      // Within 90 days repeatUser has only 1 order (the other is 91 days old), so
      // NO customer has 2+ recent orders → 0, while the all-time rate stays 1/3.
      expect(summary.customers.repeatBuyerRateLast90Days).toBe(0);
      expect(summary.customers.repeatBuyerRate).toBeCloseTo(1 / 3, 5);
    });
  });

  /**
   * getNeedsAction runs four COUNT reads over live tables (TASK-248). This block
   * clears orders/reviews/mail to a deterministic baseline (it runs last, after
   * the getSummary assertions above), seeds one of each in/out-of-scope row, and
   * asserts every counter is exact. Reuses the module-scope user/products for FKs.
   */
  describe('getNeedsAction', () => {
    beforeAll(async () => {
      // Deterministic baseline — wipe every table the four counters read.
      await prisma.orderItem.deleteMany({});
      await prisma.order.deleteMany({});
      await prisma.review.deleteMany({});
      await prisma.mailOutbox.deleteMany({});

      // Orders: 1 PENDING (new + in-transit), 1 CONFIRMED-unpaid (in-transit),
      // 1 CANCELLED-unpaid (excluded from both counters).
      await prisma.order.create({
        data: {
          userId,
          status: OrderStatus.PENDING,
          paymentStatus: PaymentStatus.PENDING,
          subtotal: '10.00',
          total: '10.00',
        },
      });
      await prisma.order.create({
        data: {
          userId,
          status: OrderStatus.CONFIRMED,
          paymentStatus: PaymentStatus.PENDING,
          subtotal: '20.00',
          total: '20.00',
        },
      });
      await prisma.order.create({
        data: {
          userId,
          status: OrderStatus.CANCELLED,
          paymentStatus: PaymentStatus.PENDING,
          subtotal: '30.00',
          total: '30.00',
        },
      });

      // Reviews: 1 awaiting moderation (isActive: false), 1 approved (excluded).
      // Unique per (userId, productId), so two distinct products.
      await prisma.review.create({
        data: { userId, productId: paidProductId, rating: 4, isActive: false },
      });
      await prisma.review.create({
        data: { userId, productId: unpaidProductId, rating: 5, isActive: true },
      });

      // Mail outbox: 1 FAILED (counted), 1 SENT (excluded).
      await prisma.mailOutbox.create({
        data: {
          type: 'ORDER_CONFIRMATION',
          recipient: 'buyer@test.local',
          payload: {},
          status: MailOutboxStatus.FAILED,
        },
      });
      await prisma.mailOutbox.create({
        data: {
          type: 'ORDER_CONFIRMATION',
          recipient: 'buyer@test.local',
          payload: {},
          status: MailOutboxStatus.SENT,
        },
      });
    });

    afterAll(async () => {
      await prisma.review.deleteMany({});
      await prisma.mailOutbox.deleteMany({});
    });

    it('counts PENDING orders, unmoderated reviews, in-transit orders, and failed mail exactly', async () => {
      const needsAction = await repo.getNeedsAction();

      // Only the PENDING order.
      expect(needsAction.newOrders).toBe(1);
      // Only the isActive: false review.
      expect(needsAction.pendingReviews).toBe(1);
      // PENDING + CONFIRMED-unpaid; the CANCELLED order is excluded.
      expect(needsAction.unpaidInTransit).toBe(2);
      // Only the FAILED outbox row; the SENT row is excluded.
      expect(needsAction.failedMails).toBe(1);
    });
  });

  /**
   * TASK-251 — the ">48h in PENDING" counter. Pins the exact 48-hour boundary:
   * a 49h-old PENDING order counts, a 47h-old one does not. Uses its own
   * order baseline (getNeedsAction's afterAll leaves its orders in place).
   */
  describe('getNeedsAction — pendingOver48h boundary (TASK-251)', () => {
    beforeAll(async () => {
      await prisma.orderStatusHistory.deleteMany({});
      await prisma.orderItem.deleteMany({});
      await prisma.order.deleteMany({});

      const now = Date.now();
      // 49h old → past the 48h threshold, counts.
      await prisma.order.create({
        data: {
          userId,
          status: OrderStatus.PENDING,
          paymentStatus: PaymentStatus.PENDING,
          subtotal: '10.00',
          total: '10.00',
          createdAt: new Date(now - 49 * 60 * 60 * 1000),
        },
      });
      // 47h old → still within the threshold, does NOT count.
      await prisma.order.create({
        data: {
          userId,
          status: OrderStatus.PENDING,
          paymentStatus: PaymentStatus.PENDING,
          subtotal: '10.00',
          total: '10.00',
          createdAt: new Date(now - 47 * 60 * 60 * 1000),
        },
      });
    });

    afterAll(async () => {
      await prisma.order.deleteMany({});
    });

    it('counts only PENDING orders older than 48 hours (49h yes, 47h no)', async () => {
      const needsAction = await repo.getNeedsAction();

      // Both are PENDING (subset semantics), only the 49h-old one is stale.
      expect(needsAction.newOrders).toBe(2);
      expect(needsAction.pendingOver48h).toBe(1);
    });
  });

  /**
   * TASK-251 — the processing-speed stat. Pins the raw-SQL LATERAL join against
   * real Postgres: the average is taken from order creation to the FIRST SHIPPED
   * history row, and orders that never shipped are excluded entirely (not counted
   * as 0). A second case asserts 0 when nothing has shipped.
   */
  describe('getSummary — average processing hours (TASK-251)', () => {
    beforeAll(async () => {
      await prisma.orderStatusHistory.deleteMany({});
      await prisma.orderItem.deleteMany({});
      await prisma.order.deleteMany({});

      // (a) Order created 10 days ago, first shipped exactly 48h later.
      const created = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000);
      const shipped = await prisma.order.create({
        data: {
          userId,
          status: OrderStatus.SHIPPED,
          paymentStatus: PaymentStatus.PAID,
          subtotal: '10.00',
          total: '10.00',
          createdAt: created,
        },
      });
      await prisma.orderStatusHistory.create({
        data: {
          orderId: shipped.id,
          changeType: OrderHistoryChangeType.STATUS,
          fromStatus: OrderStatus.PROCESSING,
          toStatus: OrderStatus.SHIPPED,
          changedAt: new Date(created.getTime() + 48 * 60 * 60 * 1000),
        },
      });

      // (b) Order created 5 days ago with NO SHIPPED history row → excluded from
      // both numerator and denominator (must not count as 0 hours).
      await prisma.order.create({
        data: {
          userId,
          status: OrderStatus.PENDING,
          paymentStatus: PaymentStatus.PENDING,
          subtotal: '10.00',
          total: '10.00',
          createdAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000),
        },
      });
    });

    afterAll(async () => {
      await prisma.orderStatusHistory.deleteMany({});
      await prisma.order.deleteMany({});
    });

    it('averages creation→first-SHIPPED only for shipped orders (48h)', async () => {
      const summary = await repo.getSummary();

      expect(summary.operations.averageProcessingHoursLast30Days).toBeCloseTo(48, 1);
    });

    it('returns 0 when no order has shipped yet', async () => {
      await prisma.orderStatusHistory.deleteMany({});
      await prisma.order.deleteMany({});
      await prisma.order.create({
        data: {
          userId,
          status: OrderStatus.PENDING,
          paymentStatus: PaymentStatus.PENDING,
          subtotal: '10.00',
          total: '10.00',
          createdAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000),
        },
      });

      const summary = await repo.getSummary();

      expect(summary.operations.averageProcessingHoursLast30Days).toBe(0);
    });
  });
});
