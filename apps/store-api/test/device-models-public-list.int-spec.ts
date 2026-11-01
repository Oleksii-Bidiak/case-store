import { INestApplication } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { randomUUID } from 'crypto';
import { CategoryRepository } from '../src/category/category.repository';
import { DeviceRepository } from '../src/device/device.repository';
import { PrismaService } from '../src/prisma';
import { PUBLIC_PRODUCT_WHERE } from '../src/product/product-visibility';
import { SlugRedirectRepository } from '../src/slug-redirect';

/**
 * The public device-model list against a REAL Postgres (TASK-1952 / TASK-2070).
 *
 * The unit spec pins the statement's shape; only a live database proves the raw
 * SQL runs, that `productCount` counts exactly what `PUBLIC_PRODUCT_WHERE` lets a
 * shopper see, and that the three orders hold.
 *
 * Fixture (all under one brand, so rows other suites leave in the DB are scoped
 * out with `deviceBrandId`):
 *
 *   gamma  — 3 visible products
 *   alpha  — 1 visible product
 *   beta   — 1 visible product + one inactive, one soft-deleted, one in an
 *            inactive category (all three must NOT count) → ties with alpha
 *   delta  — no products at all → 0, still listed
 *   hidden — an inactive model with a visible product → never listed
 *
 * Counts are chosen so `popular` (gamma, alpha, beta, delta) differs from both
 * `name` and the default newest-first order, and alpha/beta tie on count so the
 * name tie-break is exercised against the live database.
 *
 * Requires the isolated `*_test` DB (forced by setup-int.ts). Run with
 * `npm run test:int -w apps/store-api`.
 */
describe('Public device-model list (integration, TASK-1952)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let repo: DeviceRepository;

  const s = randomUUID().slice(0, 8);
  const slug = (name: string) => `dm-pub-${name}-${s}`;

  let liveCategoryId: string;
  let deadCategoryId: string;
  let deviceBrandId: string;
  const modelIds: Record<'alpha' | 'beta' | 'gamma' | 'delta' | 'hidden', string> = {
    alpha: '',
    beta: '',
    gamma: '',
    delta: '',
    hidden: '',
  };
  const productIds: string[] = [];

  beforeAll(async () => {
    const url = process.env.DATABASE_URL ?? '';
    if (!/test/i.test(url)) {
      throw new Error(`Refusing to run integration tests against a non-test database: "${url}"`);
    }

    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true })],
      providers: [PrismaService, SlugRedirectRepository, CategoryRepository, DeviceRepository],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();
    prisma = moduleRef.get(PrismaService);
    repo = moduleRef.get(DeviceRepository);

    liveCategoryId = (
      await prisma.category.create({ data: { name: 'dm-pub live', slug: slug('live') } })
    ).id;
    deadCategoryId = (
      await prisma.category.create({
        data: { name: 'dm-pub dead', slug: slug('dead'), isActive: false },
      })
    ).id;
    // Raw creates bypass the writers that keep `ancestorsActive` in step.
    await moduleRef.get(CategoryRepository).refreshBranchVisibility();

    deviceBrandId = (
      await prisma.deviceBrand.create({ data: { name: 'DmPub Brand', slug: slug('brand') } })
    ).id;

    const model = async (name: string, releaseYear: number | null, isActive = true) =>
      (
        await prisma.deviceModel.create({
          data: {
            deviceBrandId,
            name: `dmpub ${name}`,
            slug: slug(name),
            series: name === 'alpha' ? 'Alpha' : null,
            releaseYear,
            isActive,
          },
        })
      ).id;
    // Release years chosen so newest-first differs from both other orders.
    modelIds.alpha = await model('alpha', 2021);
    modelIds.beta = await model('beta', 2024);
    modelIds.gamma = await model('gamma', 2022);
    modelIds.delta = await model('delta', 2023);
    modelIds.hidden = await model('hidden', 2025, false);

    const product = async (
      name: string,
      compat: string[],
      extra: { isActive?: boolean; deletedAt?: Date; categoryId?: string } = {},
    ) => {
      const row = await prisma.product.create({
        data: {
          name,
          slug: slug(name),
          price: '9.99',
          stock: 1,
          categoryId: extra.categoryId ?? liveCategoryId,
          isActive: extra.isActive ?? true,
          deletedAt: extra.deletedAt ?? null,
          deviceCompat: { create: compat.map((deviceModelId) => ({ deviceModelId })) },
        },
      });
      productIds.push(row.id);
    };

    await product('g1', [modelIds.gamma, modelIds.alpha]);
    await product('g2', [modelIds.gamma]);
    await product('g3', [modelIds.gamma, modelIds.hidden]);
    await product('b1', [modelIds.beta]);
    await product('b-inactive', [modelIds.beta], { isActive: false });
    await product('b-deleted', [modelIds.beta], { deletedAt: new Date() });
    await product('b-dead-category', [modelIds.beta], { categoryId: deadCategoryId });
  });

  afterAll(async () => {
    if (!prisma) {
      return;
    }
    await prisma.productDeviceCompat.deleteMany({ where: { productId: { in: productIds } } });
    await prisma.product.deleteMany({ where: { id: { in: productIds } } });
    await prisma.deviceModel.deleteMany({ where: { id: { in: Object.values(modelIds) } } });
    await prisma.deviceBrand.deleteMany({ where: { id: deviceBrandId } });
    await prisma.category.deleteMany({ where: { id: { in: [liveCategoryId, deadCategoryId] } } });
    await app.close();
  });

  const list = (sort?: 'name' | 'popular', search?: string) =>
    repo.findPublicModels({ limit: 200, deviceBrandId, sort, search });

  it('counts only publicly visible products and never lists an inactive model', async () => {
    const rows = await list('popular');

    // gamma leads on count; alpha and beta tie at 1 and fall back to name order.
    expect(rows.map((r) => [r.slug, r.productCount])).toEqual([
      [slug('gamma'), 3],
      [slug('alpha'), 1],
      [slug('beta'), 1],
      [slug('delta'), 0],
    ]);
    expect(rows.find((r) => r.id === modelIds.alpha)).toMatchObject({
      id: modelIds.alpha,
      deviceBrandId,
      series: 'Alpha',
      releaseYear: 2021,
      brandName: 'DmPub Brand',
      brandSlug: slug('brand'),
    });
    expect(typeof rows[0].productCount).toBe('number');
    expect(rows.find((r) => r.id === modelIds.gamma)?.series).toBeNull();
  });

  it('agrees with a Prisma count over PUBLIC_PRODUCT_WHERE for every model', async () => {
    for (const row of await list()) {
      const expected = await prisma.product.count({
        where: { ...PUBLIC_PRODUCT_WHERE, deviceCompat: { some: { deviceModelId: row.id } } },
      });
      expect(row.productCount).toBe(expected);
    }
  });

  it('keeps newest-first by default and sorts alphabetically on sort=name', async () => {
    expect((await list()).map((r) => r.slug)).toEqual([
      slug('beta'),
      slug('delta'),
      slug('gamma'),
      slug('alpha'),
    ]);
    expect((await list('name')).map((r) => r.slug)).toEqual([
      slug('alpha'),
      slug('beta'),
      slug('delta'),
      slug('gamma'),
    ]);
  });

  it('searches case-insensitively and treats LIKE wildcards literally', async () => {
    expect((await list(undefined, 'DMPUB GAM')).map((r) => r.slug)).toEqual([slug('gamma')]);
    expect(await list(undefined, 'dmpub%')).toEqual([]);
  });
});
