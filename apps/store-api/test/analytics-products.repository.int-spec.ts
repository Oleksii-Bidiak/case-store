import { INestApplication } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { randomUUID } from 'crypto';
import { OrderStatus, PaymentStatus } from '@prisma/client';
import { ProductsReportRepository } from '../src/analytics/reports/products-report.repository';
import { ReportRange, resolveReportPeriod } from '../src/analytics/reports/report-period';
import { PrismaService } from '../src/prisma';

/**
 * Integration tests for «Лідери й аутсайдери» (TASK-688, plan 188) — the real
 * `ProductsReportRepository` on a real Postgres.
 *
 * Leaders are read over May 2022 (a month no other suite writes). Outsiders are
 * drawn from every published product in the database, so assertions look for
 * OUR products by id inside a generous limit rather than counting the list.
 */

const NOW = new Date('2026-09-26T12:00:00Z');

function days(from: string, to: string): ReportRange {
  return resolveReportPeriod({ preset: 'custom', from, to }, NOW).current;
}

const MAY = days('2022-05-01', '2022-05-31');
const WIDE = 5000;

describe('ProductsReportRepository (integration)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let repo: ProductsReportRepository;

  const created = { orders: [] as string[], products: [] as string[], categories: [] as string[] };

  async function category(isActive = true): Promise<string> {
    const row = await prisma.category.create({
      data: { name: `rep-${randomUUID()}`, slug: `rep-${randomUUID()}`, isActive },
    });
    created.categories.push(row.id);
    return row.id;
  }

  async function product(
    categoryId: string,
    opts: { isActive?: boolean; deletedAt?: string; createdAt?: string } = {},
  ): Promise<string> {
    const row = await prisma.product.create({
      data: {
        name: `p-${randomUUID()}`,
        slug: `p-${randomUUID()}`,
        price: '100',
        categoryId,
        isActive: opts.isActive ?? true,
        createdAt: new Date(opts.createdAt ?? '2021-01-01T00:00:00Z'),
        ...(opts.deletedAt ? { deletedAt: new Date(opts.deletedAt) } : {}),
      },
    });
    created.products.push(row.id);
    return row.id;
  }

  async function sale(
    productId: string,
    quantity: number,
    price: string,
    paymentStatus: PaymentStatus = PaymentStatus.PAID,
    createdAt = '2022-05-10T10:00:00Z',
  ): Promise<void> {
    const order = await prisma.order.create({
      data: {
        guestEmail: `rep-${randomUUID()}@test.local`,
        status: OrderStatus.DELIVERED,
        paymentStatus,
        subtotal: '0',
        total: '0',
        createdAt: new Date(createdAt),
        items: { create: [{ productId, quantity, price }] },
      },
    });
    created.orders.push(order.id);
  }

  beforeAll(async () => {
    const url = process.env.DATABASE_URL ?? '';
    if (!/test/i.test(url)) {
      throw new Error(`Refusing to run integration tests against a non-test database: "${url}"`);
    }
    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true })],
      providers: [PrismaService, ProductsReportRepository],
    }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    prisma = moduleRef.get(PrismaService);
    repo = moduleRef.get(ProductsReportRepository);

    const may = { gte: new Date('2022-04-30T00:00:00Z'), lt: new Date('2022-06-02T00:00:00Z') };
    const leftovers = await prisma.order.count({ where: { createdAt: may } });
    if (leftovers > 0) {
      throw new Error(
        `The test database already holds ${leftovers} orders in May 2022; clean it first`,
      );
    }
  });

  afterEach(async () => {
    await prisma.order.deleteMany({ where: { id: { in: created.orders.splice(0) } } });
    await prisma.product.deleteMany({ where: { id: { in: created.products.splice(0) } } });
    await prisma.category.deleteMany({ where: { id: { in: created.categories.splice(0) } } });
  });

  afterAll(async () => {
    if (app) await app.close();
  });

  describe('leaders', () => {
    it('ranks by money or by units, and the list itself changes with it', async () => {
      const cat = await category();
      const pricey = await product(cat);
      const cheap = await product(cat);
      await sale(pricey, 1, '1000');
      await sale(cheap, 10, '10');
      await sale(cheap, 5, '10');

      const byRevenue = await repo.getLeaders(MAY, 1, 'revenue');
      const byUnits = await repo.getLeaders(MAY, 1, 'units');

      expect(byRevenue).toEqual([
        expect.objectContaining({ productId: pricey, units: 1, orders: 1, revenue: 1000 }),
      ]);
      expect(byUnits).toEqual([
        expect.objectContaining({ productId: cheap, units: 15, orders: 2, revenue: 150 }),
      ]);
    });

    it('counts a partly or fully refunded order as sold, and nothing unpaid', async () => {
      const cat = await category();
      const p = await product(cat);
      await sale(p, 2, '10', PaymentStatus.PARTIALLY_REFUNDED);
      await sale(p, 3, '10', PaymentStatus.REFUNDED);
      await sale(p, 100, '10', PaymentStatus.PENDING);
      await sale(p, 100, '10', PaymentStatus.FAILED);

      const [leader] = await repo.getLeaders(MAY, 1, 'units');
      expect(leader).toMatchObject({ productId: p, units: 5, orders: 2, revenue: 50 });
    });

    it('reads the comparison range for given products only', async () => {
      const cat = await category();
      const a = await product(cat);
      const b = await product(cat);
      await sale(a, 4, '10');
      await sale(b, 4, '10');

      const rows = await repo.getSalesOf(MAY, [a]);
      expect(rows).toEqual([expect.objectContaining({ productId: a, units: 4 })]);
      await expect(repo.getSalesOf(MAY, [])).resolves.toEqual([]);
    });
  });

  describe('outsiders', () => {
    it('lists published products with no sale in the period, oldest first', async () => {
      const cat = await category();
      const sold = await product(cat, { createdAt: '2020-01-01T00:00:00Z' });
      const older = await product(cat, { createdAt: '2020-02-01T00:00:00Z' });
      const newer = await product(cat, { createdAt: '2020-03-01T00:00:00Z' });
      await sale(sold, 1, '10');
      // A sale outside the period does not rescue it.
      await sale(older, 1, '10', PaymentStatus.PAID, '2022-06-15T10:00:00Z');

      const { total, rows } = await repo.getOutsiders(MAY, WIDE);
      const ids = rows.map((r) => r.productId);

      expect(ids).not.toContain(sold);
      expect(ids).toContain(older);
      expect(ids.indexOf(older)).toBeLessThan(ids.indexOf(newer));
      expect(rows.find((r) => r.productId === older)?.createdAt).toBe('2020-02-01T00:00:00.000Z');
      expect(total).toBeGreaterThanOrEqual(2);
    });

    it('leaves out what is not on sale — or did not exist yet', async () => {
      const activeCat = await category();
      const offCat = await category(false);
      const inactive = await product(activeCat, { isActive: false });
      const deleted = await product(activeCat, { deletedAt: '2021-06-01T00:00:00Z' });
      const hiddenByCategory = await product(offCat);
      const bornLater = await product(activeCat, { createdAt: '2022-06-01T00:00:00Z' });
      const visible = await product(activeCat);

      const ids = (await repo.getOutsiders(MAY, WIDE)).rows.map((r) => r.productId);

      expect(ids).toContain(visible);
      for (const hidden of [inactive, deleted, hiddenByCategory, bornLater]) {
        expect(ids).not.toContain(hidden);
      }
    });

    it('counts every outsider even when the list is cut', async () => {
      const cat = await category();
      await product(cat);
      await product(cat);

      const { total, rows } = await repo.getOutsiders(MAY, 1);
      expect(rows).toHaveLength(1);
      expect(total).toBeGreaterThanOrEqual(2);
    });
  });
});
