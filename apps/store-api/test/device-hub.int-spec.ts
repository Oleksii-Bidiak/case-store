import { INestApplication, NotFoundException } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { randomUUID } from 'crypto';
import { CatalogLandingRepository } from '../src/catalog-landing/catalog-landing.repository';
import { CatalogLandingService } from '../src/catalog-landing/catalog-landing.service';
import {
  DEVICE_HUB_PRODUCTS_PER_GROUP,
  DeviceHubService,
} from '../src/catalog-landing/device-hub.service';
import { CategoryRepository } from '../src/category/category.repository';
import { DeviceRepository } from '../src/device/device.repository';
import { PrismaService } from '../src/prisma';
import { ProductRepository } from '../src/product/product.repository';
import { ProductService } from '../src/product/product.service';
import { SlugRedirectRepository } from '../src/slug-redirect';

/**
 * The model hub «Все для <модель>» (TASK-1954) against a REAL Postgres.
 *
 * The windowed query is the whole feature, and every way of getting it wrong
 * passes a mocked test: grouping by the leaf instead of the root, counting a
 * hidden product, capping the group COUNT along with the preview, ranking
 * sold-out products first, or a group count that disagrees with the landing
 * `/catalog/<root>/<model>` the group links to.
 *
 * Fixture — throwaway categories and models (suffix `s`):
 *
 *   glass   root, sortOrder 0                 → 1 product (filed in the root itself)
 *   bcases  root, sortOrder 1, name «b …»     ┬ leaf (active)  → 9 in stock + 1 sold out
 *                                              │                   + 1 inactive + 1 deleted
 *                                              └ dead (INACTIVE) → 1 product
 *   acharge root, sortOrder 1, name «a …»     → 1 product
 *   gone    root, INACTIVE                    └ under (active) → 1 product (hidden by cascade)
 *
 *   phone  (active)   — compatible with all of the above
 *   hidden (INACTIVE) — compatible with a visible product
 *   lonely (active)   — compatible with nothing
 *   ghosted (active)  — compatible only with an inactive product
 *
 * Cards are hydrated by the real `ProductRepository.findByIdsForCards` (the
 * public read `GET /products/cards` runs) behind a stand-in for ProductService,
 * whose full dependency graph (search, cache, storage) is not what is under
 * test here.
 *
 * Requires the isolated `*_test` DB (forced by setup-int.ts). Run with
 * `npx jest --config ./test/jest-int.json --runInBand test/device-hub.int-spec.ts`.
 */
describe('Device model hub (integration, TASK-1954)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let hubs: DeviceHubService;
  let landings: CatalogLandingService;

  const s = randomUUID().slice(0, 8);
  const slug = (name: string) => `hub-${name}-${s}`;

  const categoryIds: Record<string, string> = {};
  const modelIds: Record<string, string> = {};
  let deviceBrandId: string;
  const productIds: Record<string, string> = {};

  beforeAll(async () => {
    const url = process.env.DATABASE_URL ?? '';
    if (!/test/i.test(url)) {
      throw new Error(`Refusing to run integration tests against a non-test database: "${url}"`);
    }

    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true })],
      providers: [
        PrismaService,
        SlugRedirectRepository,
        CategoryRepository,
        DeviceRepository,
        ProductRepository,
        CatalogLandingRepository,
        CatalogLandingService,
        DeviceHubService,
        {
          provide: ProductService,
          inject: [ProductRepository],
          useFactory: (repository: ProductRepository) => ({
            getCardsByIds: (ids: string[]) => repository.findByIdsForCards(ids),
          }),
        },
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();

    prisma = moduleRef.get(PrismaService);
    hubs = moduleRef.get(DeviceHubService);
    landings = moduleRef.get(CatalogLandingService);

    const category = async (
      key: string,
      name: string,
      extra: { parent?: string; sortOrder?: number; isActive?: boolean; icon?: string } = {},
    ) => {
      const row = await prisma.category.create({
        data: {
          name: `${name} ${s}`,
          slug: slug(key),
          parentId: extra.parent ? categoryIds[extra.parent] : null,
          sortOrder: extra.sortOrder ?? 0,
          isActive: extra.isActive ?? true,
          icon: extra.icon ?? null,
        },
      });
      categoryIds[key] = row.id;
    };
    await category('glass', 'z glass', { sortOrder: 0, icon: 'glass' });
    await category('bcases', 'b cases', { sortOrder: 1 });
    await category('leaf', 'cases leaf', { parent: 'bcases' });
    await category('dead', 'cases dead', { parent: 'bcases', isActive: false });
    await category('acharge', 'a chargers', { sortOrder: 1 });
    await category('gone', 'gone root', { isActive: false });
    await category('under', 'gone under', { parent: 'gone' });
    // Raw creates bypass the writers that keep `ancestorsActive` in step.
    await moduleRef.get(CategoryRepository).refreshBranchVisibility();

    deviceBrandId = (
      await prisma.deviceBrand.create({ data: { name: `Hub brand ${s}`, slug: slug('brand') } })
    ).id;
    const model = async (key: string, isActive = true) => {
      modelIds[key] = (
        await prisma.deviceModel.create({
          data: {
            deviceBrandId,
            name: `Hub ${key} ${s}`,
            slug: slug(key),
            series: `Hub series ${s}`,
            isActive,
          },
        })
      ).id;
    };
    await model('phone');
    await model('hidden', false);
    await model('lonely');
    await model('ghosted');

    const base = Date.UTC(2026, 0, 1);
    const product = async (
      key: string,
      categoryKey: string,
      models: string[],
      extra: { stock?: number; minute?: number; isActive?: boolean; deletedAt?: Date } = {},
    ) => {
      const row = await prisma.product.create({
        data: {
          name: `hub ${key} ${s}`,
          slug: slug(key),
          price: '10.00',
          stock: extra.stock ?? 5,
          categoryId: categoryIds[categoryKey],
          isActive: extra.isActive ?? true,
          deletedAt: extra.deletedAt ?? null,
          createdAt: new Date(base + (extra.minute ?? 0) * 60_000),
          deviceCompat: {
            create: models.map((m) => ({ deviceModelId: modelIds[m] })),
          },
        },
      });
      productIds[key] = row.id;
    };

    // Nine in stock, oldest → newest, plus a sold-out one that is the NEWEST of
    // all: the catalogue order still puts it behind every in-stock product.
    for (let i = 0; i < 9; i += 1) {
      await product(`case-${i}`, 'leaf', ['phone'], { minute: i });
    }
    await product('case-soldout', 'leaf', ['phone'], { minute: 100, stock: 0 });
    await product('case-inactive', 'leaf', ['phone', 'ghosted'], { isActive: false, minute: 200 });
    await product('case-deleted', 'leaf', ['phone'], { deletedAt: new Date(), minute: 201 });
    await product('case-dead', 'dead', ['phone'], { minute: 202 });
    await product('glass-1', 'glass', ['phone', 'hidden']);
    await product('charger-1', 'acharge', ['phone']);
    await product('gone-1', 'under', ['phone'], { minute: 203 });
  });

  afterAll(async () => {
    if (!prisma) return;
    const ids = Object.values(productIds);
    await prisma.productDeviceCompat.deleteMany({ where: { productId: { in: ids } } });
    await prisma.product.deleteMany({ where: { id: { in: ids } } });
    await prisma.deviceModel.deleteMany({ where: { id: { in: Object.values(modelIds) } } });
    await prisma.deviceBrand.deleteMany({ where: { id: deviceBrandId } });
    // Children before roots — `Category.parent` is a plain FK.
    await prisma.category.deleteMany({
      where: { id: { in: ['leaf', 'dead', 'under'].map((k) => categoryIds[k]) } },
    });
    await prisma.category.deleteMany({
      where: { id: { in: ['glass', 'bcases', 'acharge', 'gone'].map((k) => categoryIds[k]) } },
    });
    await app.close();
  });

  it('groups by ROOT category, ordered by sortOrder then name, and hides every hidden product', async () => {
    const hub = await hubs.getDeviceHub(slug('phone'));

    expect(hub.groups.map((group) => [group.category.slug, group.productCount])).toEqual([
      [slug('glass'), 1],
      // Same sortOrder (1): «a chargers» before «b cases».
      [slug('acharge'), 1],
      // 9 in stock + 1 sold out; never the inactive, deleted or dead-category ones.
      [slug('bcases'), 10],
    ]);
    // The section glyph is the root's own icon (TASK-1956); no icon → null («folder»).
    expect(hub.groups.map((group) => group.category.icon)).toEqual(['glass', null, null]);
    // `gone` is withdrawn, and with it its active child's product (TASK-1032).
    expect(hub.groups.map((group) => group.category.slug)).not.toContain(slug('gone'));
    expect(hub.productCount).toBe(12);
    expect(hub.model).toMatchObject({
      id: modelIds.phone,
      slug: slug('phone'),
      brandName: `Hub brand ${s}`,
      brandSlug: slug('brand'),
      series: `Hub series ${s}`,
    });
  });

  it('caps the preview, not the count, and previews in catalogue order', async () => {
    const hub = await hubs.getDeviceHub(slug('phone'));
    const cases = hub.groups.find((group) => group.category.slug === slug('bcases'))!;

    expect(cases.productCount).toBe(10);
    expect(cases.products).toHaveLength(DEVICE_HUB_PRODUCTS_PER_GROUP);
    // In stock first, newest first: case-8 … case-1. The newest product of all
    // is sold out, so it falls behind the cap; case-0 is the 9th.
    expect(cases.products.map((card) => card.slug)).toEqual(
      [8, 7, 6, 5, 4, 3, 2, 1].map((i) => slug(`case-${i}`)),
    );
  });

  it('counts each group exactly as the landing /catalog/<root>/<model> does', async () => {
    const hub = await hubs.getDeviceHub(slug('phone'));

    for (const group of hub.groups) {
      const landing = await landings.getCompatPage(group.category.slug, slug('phone'));
      expect(landing.productCount).toBe(group.productCount);
    }
  });

  it('404s a deactivated model, even with visible compatible products', async () => {
    await expect(hubs.getDeviceHub(slug('hidden'))).rejects.toBeInstanceOf(NotFoundException);
  });

  it('404s a model nothing is compatible with', async () => {
    await expect(hubs.getDeviceHub(slug('lonely'))).rejects.toBeInstanceOf(NotFoundException);
  });

  it('404s a model whose only compatible product is hidden', async () => {
    await expect(hubs.getDeviceHub(slug('ghosted'))).rejects.toBeInstanceOf(NotFoundException);
  });

  it('404s an unknown slug', async () => {
    await expect(hubs.getDeviceHub(slug('nope'))).rejects.toBeInstanceOf(NotFoundException);
  });
});
