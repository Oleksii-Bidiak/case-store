import { INestApplication } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { randomUUID } from 'crypto';
import { PrismaService } from '../src/prisma';
import { ProductRepository } from '../src/product/product.repository';
import { SlugRedirectRepository } from '../src/slug-redirect/slug-redirect.repository';

/**
 * Integration tests for the search article-number lookup (TASK-542) — the REAL
 * repository against a REAL Postgres.
 *
 * The unit spec only proves which Prisma filter is sent; what the fix rests on is
 * what Postgres does with it: `ip15-1` must find `IP15-1`, a Cyrillic code must
 * fold case too, and a code carrying LIKE metacharacters must not turn into a
 * pattern that matches some other position.
 *
 * Requires an isolated `*_test` database; DATABASE_URL is forced to it by
 * setup-int.ts. Run with `npm run test:int -w apps/store-api`.
 */
describe('ProductRepository.findBySkuIgnoringCase (integration)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let repo: ProductRepository;

  let categoryId: string;
  // A per-run prefix keeps these codes clear of any other suite's rows.
  const run = randomUUID().slice(0, 8).toUpperCase();
  let createdProducts: string[] = [];

  const mkProduct = async (sku: string, extra: { deletedAt?: Date } = {}): Promise<string> => {
    const product = await prisma.product.create({
      data: {
        name: `sku-lookup ${sku}`,
        slug: `sku-lookup-${randomUUID()}`,
        price: 10,
        stock: 1,
        sku,
        categoryId,
        ...extra,
      },
    });
    createdProducts.push(product.id);
    return product.id;
  };

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
    repo = moduleRef.get(ProductRepository);

    const category = await prisma.category.create({
      data: { name: 'sku-lookup', slug: `sku-lookup-${randomUUID()}` },
    });
    categoryId = category.id;
  });

  beforeEach(() => {
    createdProducts = [];
  });

  afterEach(async () => {
    await prisma.product.deleteMany({ where: { id: { in: createdProducts } } });
  });

  afterAll(async () => {
    await prisma.category.deleteMany({ where: { id: categoryId } });
    await app.close();
  });

  it('finds IP15-1 for the query ip15-1', async () => {
    const id = await mkProduct(`IP15-1-${run}`);

    const found = await repo.findBySkuIgnoringCase(`ip15-1-${run.toLowerCase()}`);

    expect(found?.id).toBe(id);
  });

  it('folds case in a Cyrillic code too', async () => {
    const id = await mkProduct(`ЧОХОЛ-7-${run}`);

    const found = await repo.findBySkuIgnoringCase(`чохол-7-${run.toLowerCase()}`);

    expect(found?.id).toBe(id);
  });

  it('is an equality, not a pattern — `_` and `%` in the query match only themselves', async () => {
    await mkProduct(`AB-1-${run}`);

    await expect(repo.findBySkuIgnoringCase(`ab_1-${run}`)).resolves.toBeNull();
    await expect(repo.findBySkuIgnoringCase(`ab%-${run}`)).resolves.toBeNull();
    await expect(repo.findBySkuIgnoringCase(`ab-1-%`)).resolves.toBeNull();
  });

  it('still finds a code that itself contains `_`, `%` or `\\`', async () => {
    const id = await mkProduct(`EE_4%\\X-${run}`);

    expect((await repo.findBySkuIgnoringCase(`ee_4%\\x-${run.toLowerCase()}`))?.id).toBe(id);
  });

  it('prefers the exact-case position when two differ only by case', async () => {
    const upper = await mkProduct(`CC-2-${run}`);
    const lower = await mkProduct(`cc-2-${run.toLowerCase()}`);

    expect((await repo.findBySkuIgnoringCase(`CC-2-${run}`))?.id).toBe(upper);
    expect((await repo.findBySkuIgnoringCase(`cc-2-${run.toLowerCase()}`))?.id).toBe(lower);
    // Neither spelling: the code no longer names ONE position, so it answers
    // nothing and search falls through to the full-text path showing both.
    await expect(repo.findBySkuIgnoringCase(`Cc-2-${run}`)).resolves.toBeNull();
  });

  it('never returns a soft-deleted position', async () => {
    await mkProduct(`DD-3-${run}`, { deletedAt: new Date() });

    await expect(repo.findBySkuIgnoringCase(`dd-3-${run.toLowerCase()}`)).resolves.toBeNull();
  });
});
