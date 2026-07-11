import { INestApplication } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { randomUUID } from 'crypto';
import { ProductRepository } from '../src/product/product.repository';
import { PrismaService } from '../src/prisma';
import { SlugRedirectRepository } from '../src/slug-redirect';

/**
 * Integration coverage for the TASK-164 bestselling sort against a REAL Postgres.
 * Proves the aggregate ranks products by units SOLD across PAID orders — not by
 * order count, not counting unpaid orders — and that zero-sales products still
 * appear (newest-first tail) so the catalogue stays browsable.
 *
 *   hot  → 2 PAID orders, 5 + 3 = 8 units       → rank 1
 *   warm → 1 PAID order, 4 units                → rank 2
 *   ghost→ 1 PENDING (unpaid) order, 99 units   → 0 counted → tail
 *   cold → never ordered                        → 0 → tail
 *
 * Requires the isolated `*_test` DB (forced by setup-int.ts). Run with
 * `npm run test:int -w apps/store-api`.
 */
describe('Bestselling product sort (integration, TASK-164)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let productRepo: ProductRepository;

  let categoryId: string;
  let hotId: string;
  let warmId: string;
  let ghostId: string;
  let coldId: string;
  let userId: string;
  const orderIds: string[] = [];

  beforeAll(async () => {
    const url = process.env.DATABASE_URL ?? '';
    if (!/test/i.test(url)) {
      throw new Error(`Refusing to run integration tests against a non-test database: "${url}"`);
    }

    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true })],
      providers: [PrismaService, ProductRepository, SlugRedirectRepository],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();

    prisma = moduleRef.get(PrismaService);
    productRepo = moduleRef.get(ProductRepository);

    const s = randomUUID();
    const category = await prisma.category.create({
      data: { name: 'bestseller-cat', slug: `bestseller-cat-${s}` },
    });
    categoryId = category.id;

    const mk = async (name: string, createdAt: Date) => {
      const p = await prisma.product.create({
        data: { name, slug: `${name}-${s}`, price: '10.00', categoryId, createdAt },
      });
      return p.id;
    };
    // Distinct createdAt so the zero-sales tie-break (newest first) is deterministic.
    hotId = await mk('hot', new Date('2024-01-01'));
    warmId = await mk('warm', new Date('2024-01-02'));
    ghostId = await mk('ghost', new Date('2024-01-03'));
    coldId = await mk('cold', new Date('2024-01-04'));

    const user = await prisma.user.create({
      data: {
        email: `bestseller-${s}@example.com`,
        passwordHash: 'x',
        firstName: 'Best',
        lastName: 'Seller',
      },
    });
    userId = user.id;

    const mkOrder = async (
      paymentStatus: 'PAID' | 'PENDING',
      items: { productId: string; quantity: number }[],
    ) => {
      const order = await prisma.order.create({
        data: {
          userId,
          paymentStatus,
          subtotal: '10.00',
          total: '10.00',
          items: {
            create: items.map((it) => ({
              productId: it.productId,
              quantity: it.quantity,
              price: '10.00',
            })),
          },
        },
      });
      orderIds.push(order.id);
    };

    await mkOrder('PAID', [{ productId: hotId, quantity: 5 }]);
    await mkOrder('PAID', [{ productId: hotId, quantity: 3 }]);
    await mkOrder('PAID', [{ productId: warmId, quantity: 4 }]);
    // Unpaid — must NOT count despite a huge quantity.
    await mkOrder('PENDING', [{ productId: ghostId, quantity: 99 }]);
  });

  afterAll(async () => {
    if (!prisma) {
      return;
    }
    await prisma.orderItem.deleteMany({ where: { orderId: { in: orderIds } } });
    await prisma.order.deleteMany({ where: { id: { in: orderIds } } });
    await prisma.product.deleteMany({
      where: { id: { in: [hotId, warmId, ghostId, coldId] } },
    });
    await prisma.user.deleteMany({ where: { id: userId } });
    await prisma.category.deleteMany({ where: { id: categoryId } });
    await app.close();
  });

  it('ranks by units sold across PAID orders; unpaid quantities do not count', async () => {
    const { products, total } = await productRepo.findAll({
      page: 1,
      limit: 20,
      categoryIds: [categoryId],
      sortBy: 'bestselling',
      sortOrder: 'desc',
    });

    expect(total).toBe(4);
    const order = products.map((p) => p.id);
    // hot (8 units) then warm (4 units) lead; ghost (unpaid) and cold (never
    // sold) sink to the zero-sales tail, newest createdAt first (cold > ghost).
    expect(order.slice(0, 2)).toEqual([hotId, warmId]);
    expect(order.indexOf(coldId)).toBeLessThan(order.indexOf(ghostId));
  });

  it('still returns the full candidate set (zero-sales products included)', async () => {
    const { products } = await productRepo.findAll({
      page: 1,
      limit: 20,
      categoryIds: [categoryId],
      sortBy: 'bestselling',
      sortOrder: 'desc',
    });
    expect(products.map((p) => p.id).sort()).toEqual([hotId, warmId, ghostId, coldId].sort());
  });

  it('paginates the ranked list', async () => {
    const { products, total } = await productRepo.findAll({
      page: 1,
      limit: 2,
      categoryIds: [categoryId],
      sortBy: 'bestselling',
      sortOrder: 'desc',
    });
    expect(total).toBe(4);
    expect(products.map((p) => p.id)).toEqual([hotId, warmId]);
  });
});
