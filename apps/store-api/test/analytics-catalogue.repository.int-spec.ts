import { INestApplication } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { randomUUID } from 'crypto';
import { OrderStatus, PaymentStatus } from '@prisma/client';
import { CatalogueRepository } from '../src/analytics/reports/catalogue.repository';
import { ReportRange, resolveReportPeriod } from '../src/analytics/reports/report-period';
import { PrismaService } from '../src/prisma';

/**
 * Integration tests for «Продажі за категорією і брендом» (TASK-687, plan 188) —
 * the real `CatalogueRepository` on a real Postgres.
 *
 * The report sums whole subtrees and reads the catalogue as it is NOW, so the
 * fixture is a small tree of its own: root «Чохли» → «Для iPhone» → «Шкіряні»,
 * plus a sibling root. Root categories are listed globally, so assertions look
 * for OUR rows by id rather than counting the table; orders are dated March
 * 2023, a month no other suite writes, and every row is removed afterwards.
 */

const NOW = new Date('2026-09-26T12:00:00Z');

function days(from: string, to: string): ReportRange {
  return resolveReportPeriod({ preset: 'custom', from, to }, NOW).current;
}

const MARCH = days('2023-03-01', '2023-03-31');

describe('CatalogueRepository (integration)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let repo: CatalogueRepository;

  const created = {
    orders: [] as string[],
    products: [] as string[],
    categories: [] as string[],
    brands: [] as string[],
  };

  const tag = randomUUID().slice(0, 8);

  async function category(name: string, parentId: string | null, isActive = true): Promise<string> {
    const row = await prisma.category.create({
      data: { name: `${name} ${tag}`, slug: `cat-${randomUUID()}`, parentId, isActive },
    });
    // Children first on cleanup: parent_id is a self-reference.
    created.categories.unshift(row.id);
    return row.id;
  }

  async function brand(name: string): Promise<string> {
    const row = await prisma.brand.create({
      data: { name: `${name} ${tag}`, slug: `brand-${randomUUID()}` },
    });
    created.brands.push(row.id);
    return row.id;
  }

  async function product(categoryId: string, brandId: string | null = null): Promise<string> {
    const row = await prisma.product.create({
      data: {
        name: `p-${randomUUID()}`,
        slug: `p-${randomUUID()}`,
        price: '100',
        categoryId,
        brandId,
      },
    });
    created.products.push(row.id);
    return row.id;
  }

  async function sale(
    lines: Array<{ productId: string; quantity: number; price: string }>,
    opts: { createdAt?: string; paymentStatus?: PaymentStatus } = {},
  ): Promise<void> {
    const order = await prisma.order.create({
      data: {
        guestEmail: `cat-${randomUUID()}@test.local`,
        status: OrderStatus.DELIVERED,
        paymentStatus: opts.paymentStatus ?? PaymentStatus.PAID,
        subtotal: '0',
        total: '0',
        createdAt: new Date(opts.createdAt ?? '2023-03-10T10:00:00Z'),
        items: { create: lines },
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
      providers: [PrismaService, CatalogueRepository],
    }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    prisma = moduleRef.get(PrismaService);
    repo = moduleRef.get(CatalogueRepository);

    const march = { gte: new Date('2023-02-28T00:00:00Z'), lt: new Date('2023-04-02T00:00:00Z') };
    const leftovers = await prisma.order.count({ where: { createdAt: march } });
    if (leftovers > 0) {
      throw new Error(
        `The test database already holds ${leftovers} orders in March 2023; clean it first`,
      );
    }
  });

  afterEach(async () => {
    await prisma.order.deleteMany({ where: { id: { in: created.orders.splice(0) } } });
    await prisma.product.deleteMany({ where: { id: { in: created.products.splice(0) } } });
    for (const id of created.categories.splice(0)) {
      await prisma.category.delete({ where: { id } });
    }
    await prisma.brand.deleteMany({ where: { id: { in: created.brands.splice(0) } } });
  });

  afterAll(async () => {
    if (app) await app.close();
  });

  it('sums a root category over its whole subtree', async () => {
    const cases = await category('Чохли', null);
    const forIphone = await category('Для iPhone', cases);
    const leather = await category('Шкіряні', forIphone);
    const other = await category('Скло', null);

    const onRoot = await product(cases);
    const deep = await product(leather);
    const glass = await product(other);

    await sale([
      { productId: onRoot, quantity: 1, price: '100' },
      { productId: deep, quantity: 2, price: '250' },
    ]);
    await sale([{ productId: deep, quantity: 1, price: '250' }]);
    await sale([{ productId: glass, quantity: 3, price: '50' }]);

    const rows = await repo.getCategorySales(MARCH, null);
    const casesRow = rows.find((r) => r.categoryId === cases);
    const otherRow = rows.find((r) => r.categoryId === other);

    expect(casesRow).toMatchObject({
      units: 4,
      orders: 2,
      revenue: 850,
      direct: false,
      hasChildren: true,
    });
    expect(otherRow).toMatchObject({ units: 3, orders: 1, revenue: 150, hasChildren: false });
    // Children are not root rows.
    expect(rows.find((r) => r.categoryId === forIphone)).toBeUndefined();
  });

  it('expands a category into its children plus a «directly here» row', async () => {
    const cases = await category('Чохли', null);
    const forIphone = await category('Для iPhone', cases);
    const leather = await category('Шкіряні', forIphone);
    const forSamsung = await category('Для Samsung', cases);

    const onRoot = await product(cases);
    const deep = await product(leather);
    await product(forSamsung); // sells nothing

    await sale([
      { productId: onRoot, quantity: 1, price: '100' },
      { productId: deep, quantity: 2, price: '250' },
    ]);

    const rows = await repo.getCategorySales(MARCH, cases);

    expect(rows.find((r) => r.categoryId === forIphone)).toMatchObject({
      units: 2,
      revenue: 500,
      direct: false,
      hasChildren: true,
    });
    // An active child that sold nothing still shows, at zero.
    expect(rows.find((r) => r.categoryId === forSamsung)).toMatchObject({
      units: 0,
      orders: 0,
      revenue: 0,
    });
    expect(rows.find((r) => r.categoryId === cases && r.direct)).toMatchObject({
      units: 1,
      revenue: 100,
      direct: true,
    });
    expect(rows).toHaveLength(3);
  });

  it('lists a switched-off category only when it sold something', async () => {
    const root = await category('Архів', null);
    const offSold = await category('Вимкнена з продажами', root, false);
    await category('Вимкнена без продажів', root, false);
    const p = await product(offSold);
    await sale([{ productId: p, quantity: 1, price: '100' }]);

    const rows = await repo.getCategorySales(MARCH, root);

    expect(rows.map((r) => r.categoryId)).toEqual([offSold]);
  });

  it('counts only the sales base, by the Kyiv day of the order', async () => {
    const root = await category('База', null);
    const p = await product(root);

    await sale([{ productId: p, quantity: 1, price: '100' }], {
      paymentStatus: PaymentStatus.PARTIALLY_REFUNDED,
    });
    await sale([{ productId: p, quantity: 1, price: '100' }], {
      paymentStatus: PaymentStatus.REFUNDED,
    });
    await sale([{ productId: p, quantity: 5, price: '100' }], {
      paymentStatus: PaymentStatus.PENDING,
    });
    await sale([{ productId: p, quantity: 5, price: '100' }], {
      paymentStatus: PaymentStatus.FAILED,
    });
    // 22:30 UTC on 31 March = 01:30 on 1 April in Kyiv (EEST): not March.
    await sale([{ productId: p, quantity: 7, price: '100' }], {
      createdAt: '2023-03-31T22:30:00Z',
    });

    const rows = await repo.getCategorySales(MARCH, null);
    expect(rows.find((r) => r.categoryId === root)).toMatchObject({
      units: 2,
      orders: 2,
      revenue: 200,
    });
  });

  it('gives brands a flat list with a «Без бренду» row', async () => {
    const root = await category('Бренди', null);
    const apple = await brand('Apple');
    const withBrand = await product(root, apple);
    const noBrand = await product(root, null);

    await sale([
      { productId: withBrand, quantity: 2, price: '300' },
      { productId: noBrand, quantity: 1, price: '40' },
    ]);

    const rows = await repo.getBrandSales(MARCH);

    expect(rows.find((r) => r.brandId === apple)).toMatchObject({
      units: 2,
      orders: 1,
      revenue: 600,
      name: `Apple ${tag}`,
    });
    expect(rows.find((r) => r.brandId === null)).toMatchObject({
      units: 1,
      orders: 1,
      revenue: 40,
      name: null,
    });
  });

  it('knows whether a category exists', async () => {
    const root = await category('Є', null);
    await expect(repo.categoryExists(root)).resolves.toBe(true);
    await expect(repo.categoryExists(randomUUID())).resolves.toBe(false);
  });
});
