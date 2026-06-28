import { INestApplication } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { randomUUID } from 'crypto';
import { OrderStatus, PaymentStatus } from '@prisma/client';
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
      where: { id: { in: [paidProductId, unpaidProductId, cancelledProductId] } },
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

  describe('getSummary — low stock', () => {
    it('includes products at/below the threshold, excludes healthy stock, ordered ascending', async () => {
      const summary = await repo.getSummary();
      const products = summary.inventory.lowStockProducts;

      expect(products.find((p) => p.productId === paidProductId)).toBeDefined();
      expect(products.find((p) => p.productId === unpaidProductId)).toBeUndefined();
      expect(products.find((p) => p.productId === cancelledProductId)).toBeUndefined();

      const stocks = products.map((p) => p.stock);
      const sorted = [...stocks].sort((a, b) => a - b);
      expect(stocks).toEqual(sorted);
    });
  });
});
