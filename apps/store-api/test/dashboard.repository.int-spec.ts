import { INestApplication } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { randomUUID } from 'crypto';
import { OrderStatus } from '@prisma/client';
import { DashboardRepository } from '../src/dashboard/dashboard.repository';
import { LOW_STOCK_THRESHOLD } from '../src/dashboard/dashboard.types';
import { PrismaService } from '../src/prisma';

/**
 * Integration tests for DashboardRepository — run the REAL repository against a
 * REAL Postgres instance (no mocks). These exercise the raw `$queryRaw` SQL the
 * mocked e2e suite (dashboard.e2e-spec.ts) cannot reach: the `generate_series`
 * gap-fill, the `SUM(price * quantity)` top-products arithmetic, and the
 * CANCELLED/REFUNDED exclusion (TASK-064).
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
  let topProductId: string; // appears in DELIVERED + PENDING orders
  let cancelledProductId: string; // appears only in a CANCELLED order
  let lowStockVariantId: string; // stock below threshold
  let healthyVariantId: string; // stock above threshold

  // DELIVERED qty 3 @ $10 = $30; PENDING qty 1 @ $10 = $10  → $40 earned.
  const EXPECTED_TOP_REVENUE = 40;

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

    const topProduct = await prisma.product.create({
      data: { name: 'Dash Top Product', slug: `dash-top-${suffix}`, price: '10.00', categoryId },
    });
    topProductId = topProduct.id;

    const lowStockVariant = await prisma.productVariant.create({
      data: {
        productId: topProductId,
        name: 'Low Stock Variant',
        price: '10.00',
        stock: LOW_STOCK_THRESHOLD - 2, // e.g. 3 — below threshold
      },
    });
    lowStockVariantId = lowStockVariant.id;

    const cancelledProduct = await prisma.product.create({
      data: {
        name: 'Dash Cancelled Product',
        slug: `dash-cancel-${suffix}`,
        price: '20.00',
        categoryId,
      },
    });
    cancelledProductId = cancelledProduct.id;

    const healthyVariant = await prisma.productVariant.create({
      data: {
        productId: cancelledProductId,
        name: 'Healthy Variant',
        price: '20.00',
        stock: LOW_STOCK_THRESHOLD + 50, // well above threshold
      },
    });
    healthyVariantId = healthyVariant.id;

    // Revenue-bearing orders for the top product (DELIVERED + PENDING).
    await prisma.order.create({
      data: {
        userId,
        status: OrderStatus.DELIVERED,
        subtotal: '30.00',
        total: '30.00',
        items: {
          create: [
            { productId: topProductId, variantId: lowStockVariantId, quantity: 3, price: '10.00' },
          ],
        },
      },
    });

    await prisma.order.create({
      data: {
        userId,
        status: OrderStatus.PENDING,
        subtotal: '10.00',
        total: '10.00',
        items: {
          create: [
            { productId: topProductId, variantId: lowStockVariantId, quantity: 1, price: '10.00' },
          ],
        },
      },
    });

    // CANCELLED order for the cancelled product — must NOT count toward revenue.
    await prisma.order.create({
      data: {
        userId,
        status: OrderStatus.CANCELLED,
        subtotal: '100.00',
        total: '100.00',
        items: {
          create: [
            {
              productId: cancelledProductId,
              variantId: healthyVariantId,
              quantity: 5,
              price: '20.00',
            },
          ],
        },
      },
    });
  });

  afterAll(async () => {
    if (!prisma) {
      return;
    }
    await prisma.orderItem.deleteMany({});
    await prisma.order.deleteMany({});
    await prisma.productVariant.deleteMany({
      where: { id: { in: [lowStockVariantId, healthyVariantId] } },
    });
    await prisma.product.deleteMany({ where: { id: { in: [topProductId, cancelledProductId] } } });
    await prisma.category.deleteMany({ where: { id: categoryId } });
    await prisma.user.deleteMany({ where: { id: userId } });
    await app.close();
  });

  describe('getSummary — top products', () => {
    it('uses SUM(price * quantity) and excludes CANCELLED/REFUNDED orders', async () => {
      const summary = await repo.getSummary();
      const { topProducts } = summary.products;

      const top = topProducts.find((p) => p.productId === topProductId);
      expect(top).toBeDefined();
      // 3*$10 (DELIVERED) + 1*$10 (PENDING) = $40 — proves quantity weighting.
      expect(top?.totalRevenue).toBe(EXPECTED_TOP_REVENUE);

      // The product whose only order is CANCELLED must not appear at all.
      expect(topProducts.find((p) => p.productId === cancelledProductId)).toBeUndefined();
    });
  });

  describe('getSummary — revenue series gap-fill', () => {
    it('returns a full 30-point series with today summing the non-cancelled orders', async () => {
      const summary = await repo.getSummary();
      const series = summary.revenue.revenueByDay;

      // generate_series always yields the full window.
      expect(series).toHaveLength(30);

      // Today is the last (ascending) bucket — DELIVERED + PENDING, no CANCELLED.
      expect(series[series.length - 1].value).toBe(EXPECTED_TOP_REVENUE);

      // At least one earlier day has no orders → gap-filled to 0.
      expect(series.some((point) => point.value === 0)).toBe(true);
    });
  });

  describe('getSummary — low stock', () => {
    it('includes variants at/below the threshold, excludes healthy stock, ordered ascending', async () => {
      const summary = await repo.getSummary();
      const variants = summary.inventory.lowStockVariants;

      expect(variants.find((v) => v.variantId === lowStockVariantId)).toBeDefined();
      expect(variants.find((v) => v.variantId === healthyVariantId)).toBeUndefined();

      const stocks = variants.map((v) => v.stock);
      const sorted = [...stocks].sort((a, b) => a - b);
      expect(stocks).toEqual(sorted);
    });
  });
});
