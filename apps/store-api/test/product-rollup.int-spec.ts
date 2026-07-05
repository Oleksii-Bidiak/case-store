import { INestApplication } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { randomUUID } from 'crypto';
import { CategoryRepository } from '../src/category/category.repository';
import { ProductRepository } from '../src/product/product.repository';
import { PrismaService } from '../src/prisma';

/**
 * Integration regression for the TASK-236 category subtree rollup — the core
 * bug this plan fixes: seed/staff file products in LEAF categories, so an
 * exact-match `categoryId = root` returned nothing. Here we prove, against a
 * REAL Postgres tree, that resolving the subtree (`findSubtreeIds`) and passing
 * it to `ProductRepository.findAll` rolls a parent category up to its
 * descendants' products — while a leaf filter stays narrow and an unrelated
 * root does not over-broaden.
 *
 *   root ("cases")
 *     └── child ("iphone-cases")  ← product filed HERE
 *   other-root ("chargers")       ← unrelated, must not match
 *
 * Requires the isolated `*_test` DB (forced by setup-int.ts). Run with
 * `npm run test:int -w apps/store-api`.
 */
describe('Category subtree rollup (integration)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let categoryRepo: CategoryRepository;
  let productRepo: ProductRepository;

  let rootId: string;
  let childId: string;
  let otherRootId: string;
  let leafProductId: string;

  beforeAll(async () => {
    const url = process.env.DATABASE_URL ?? '';
    if (!/test/i.test(url)) {
      throw new Error(`Refusing to run integration tests against a non-test database: "${url}"`);
    }

    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true })],
      providers: [PrismaService, CategoryRepository, ProductRepository],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();

    prisma = moduleRef.get(PrismaService);
    categoryRepo = moduleRef.get(CategoryRepository);
    productRepo = moduleRef.get(ProductRepository);

    const s = randomUUID();
    const root = await prisma.category.create({ data: { name: 'cases', slug: `cases-${s}` } });
    rootId = root.id;
    const child = await prisma.category.create({
      data: { name: 'iphone-cases', slug: `iphone-cases-${s}`, parentId: rootId },
    });
    childId = child.id;
    const otherRoot = await prisma.category.create({
      data: { name: 'chargers', slug: `chargers-${s}` },
    });
    otherRootId = otherRoot.id;

    // The product lives in the LEAF, not the root — the exact scenario the bug missed.
    const product = await prisma.product.create({
      data: {
        name: 'Clear MagSafe Case',
        slug: `clear-magsafe-${s}`,
        price: '29.99',
        categoryId: childId,
      },
    });
    leafProductId = product.id;
  });

  afterAll(async () => {
    if (!prisma) {
      return;
    }
    await prisma.product.deleteMany({ where: { id: leafProductId } });
    await prisma.category.deleteMany({ where: { id: { in: [childId, rootId, otherRootId] } } });
    await app.close();
  });

  it('filtering by the ROOT category rolls up the subcategory product', async () => {
    const categoryIds = await categoryRepo.findSubtreeIds(rootId);
    const { products, total } = await productRepo.findAll({ page: 1, limit: 20, categoryIds });

    expect(total).toBe(1);
    expect(products.map((p) => p.id)).toContain(leafProductId);
  });

  it('filtering by the LEAF category still returns exactly that leaf product (no over-broadening)', async () => {
    const categoryIds = await categoryRepo.findSubtreeIds(childId);
    const { products, total } = await productRepo.findAll({ page: 1, limit: 20, categoryIds });

    expect(total).toBe(1);
    expect(products[0].id).toBe(leafProductId);
  });

  it('filtering by an unrelated root does NOT match the product', async () => {
    const categoryIds = await categoryRepo.findSubtreeIds(otherRootId);
    const { total } = await productRepo.findAll({ page: 1, limit: 20, categoryIds });

    expect(total).toBe(0);
  });
});
