import { INestApplication } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { randomUUID } from 'crypto';
import { ProductRepository } from '../src/product/product.repository';
import { parseSpecFilters } from '../src/product/dto/product-list-query.dto';
import { PrismaService } from '../src/prisma';
import { SlugRedirectRepository } from '../src/slug-redirect';
import { ProductDeviceCompatRepository } from '../src/product/product-device-compat.repository';

/**
 * Integration coverage for the TASK-414 catalogue filters against a REAL
 * Postgres — the two rules that a mocked Prisma cannot prove:
 *
 *   1. `inStock` means `stock > 0`, applied to the page AND the count.
 *   2. Multi-value spec facets (owner decision B-10): values INSIDE a facet are
 *      OR-ed, facets are AND-ed.
 *
 * Rule 2 is the reason this file exists at all. The AND is built as one
 * `where.AND` entry per facet, each an EXISTS over `product_attribute_values`.
 * The tempting shape — a single `specValues.some({ definition: { key: { in:
 * [...] } }, value: { in: [...] } })` — type-checks, passes a `where`-shape unit
 * test, and is wrong in a way only the database reveals: it matches a product
 * carrying EITHER facet (and even a cross-product of key/value that was never
 * requested), instead of both. Here four products with deliberately overlapping
 * specs pin the difference down.
 *
 * Fixture (one throwaway category, two filterable definitions):
 *
 *   silicone-case  material=Силікон  form=Накладка   stock 5
 *   tpu-case       material=TPU      form=Накладка   stock 3
 *   leather-book   material=Шкіра    form=Книжка     stock 7
 *   silicone-book  material=Силікон  form=Книжка     stock 0  ← sold out
 *
 * Requires the isolated `*_test` DB (forced by setup-int.ts). Run with
 * `npm run test:int -w apps/store-api`.
 */
describe('Catalogue filters: inStock + multi-value spec facets (integration)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let productRepo: ProductRepository;

  let categoryId: string;
  let materialDefId: string;
  let formDefId: string;
  let screenDefId: string;
  let gripDefId: string;
  const productIds: string[] = [];
  const nameById = new Map<string, string>();

  /** Run a listing scoped to this fixture's category and return product names. */
  async function listNames(
    params: Partial<Parameters<ProductRepository['findAll']>[0]> = {},
  ): Promise<string[]> {
    const { products } = await productRepo.findAll({
      page: 1,
      limit: 50,
      categoryIds: [categoryId],
      ...params,
    });
    return products.map((product) => product.name).sort();
  }

  beforeAll(async () => {
    const url = process.env.DATABASE_URL ?? '';
    if (!/test/i.test(url)) {
      throw new Error(`Refusing to run integration tests against a non-test database: "${url}"`);
    }

    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true })],
      providers: [
        PrismaService,
        ProductRepository,
        SlugRedirectRepository,
        ProductDeviceCompatRepository,
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();

    prisma = moduleRef.get(PrismaService);
    productRepo = moduleRef.get(ProductRepository);

    const s = randomUUID();

    const category = await prisma.category.create({
      data: { name: 'facet-cases', slug: `facet-cases-${s}` },
    });
    categoryId = category.id;

    const material = await prisma.attributeDefinition.create({
      data: {
        categoryId,
        key: 'material',
        label: 'Матеріал',
        type: 'SELECT',
        isFilterable: true,
        sortOrder: 0,
      },
    });
    materialDefId = material.id;

    const form = await prisma.attributeDefinition.create({
      data: {
        categoryId,
        key: 'form',
        label: 'Форм-фактор',
        type: 'SELECT',
        isFilterable: true,
        sortOrder: 1,
      },
    });
    formDefId = form.id;

    // Two specs that are NOT facets (TASK-706): a legacy filterable TEXT row
    // (the database predates validateFacetType) and a SELECT nobody marked
    // filterable. Both carried by silicone-case, so a match would show.
    const screen = await prisma.attributeDefinition.create({
      data: {
        categoryId,
        key: 'screen',
        label: 'Екран',
        type: 'TEXT',
        isFilterable: true,
        sortOrder: 2,
      },
    });
    screenDefId = screen.id;
    const grip = await prisma.attributeDefinition.create({
      data: {
        categoryId,
        key: 'grip',
        label: 'Хват',
        type: 'SELECT',
        isFilterable: false,
        sortOrder: 3,
      },
    });
    gripDefId = grip.id;

    const fixtures: Array<{ name: string; material: string; form: string; stock: number }> = [
      { name: 'silicone-case', material: 'Силікон', form: 'Накладка', stock: 5 },
      { name: 'tpu-case', material: 'TPU', form: 'Накладка', stock: 3 },
      { name: 'leather-book', material: 'Шкіра', form: 'Книжка', stock: 7 },
      { name: 'silicone-book', material: 'Силікон', form: 'Книжка', stock: 0 },
    ];

    for (const fixture of fixtures) {
      const product = await prisma.product.create({
        data: {
          name: fixture.name,
          slug: `${fixture.name}-${s}`,
          price: '19.99',
          stock: fixture.stock,
          categoryId,
          specValues: {
            create: [
              { definitionId: materialDefId, value: fixture.material },
              { definitionId: formDefId, value: fixture.form },
            ],
          },
        },
      });
      productIds.push(product.id);
      if (fixture.name === 'silicone-case') {
        await prisma.productAttributeValue.createMany({
          data: [
            { productId: product.id, definitionId: screenDefId, value: '6.1" OLED' },
            { productId: product.id, definitionId: gripDefId, value: 'Так' },
          ],
        });
      }
      nameById.set(product.id, fixture.name);
    }
  });

  afterAll(async () => {
    if (!prisma) {
      return;
    }
    // Spec values cascade from the product; definitions cascade from the
    // category. Deleted in dependency order all the same, so a partial failure
    // above still leaves the test DB clean.
    await prisma.productAttributeValue.deleteMany({ where: { productId: { in: productIds } } });
    await prisma.product.deleteMany({ where: { id: { in: productIds } } });
    await prisma.attributeDefinition.deleteMany({
      where: { id: { in: [materialDefId, formDefId, screenDefId, gripDefId] } },
    });
    await prisma.category.deleteMany({ where: { id: categoryId } });
    await app.close();
  });

  describe('inStock (TASK-414)', () => {
    it('lists everything when the filter is off', async () => {
      expect(await listNames()).toEqual([
        'leather-book',
        'silicone-book',
        'silicone-case',
        'tpu-case',
      ]);
    });

    it('drops the sold-out position when inStock is on', async () => {
      expect(await listNames({ inStock: true })).toEqual([
        'leather-book',
        'silicone-case',
        'tpu-case',
      ]);
    });

    it('applies the filter to the TOTAL as well as the page', async () => {
      const { total } = await productRepo.findAll({
        page: 1,
        limit: 50,
        categoryIds: [categoryId],
        inStock: true,
      });

      // A count that ignored the predicate would advertise a fourth product the
      // list refuses to return — an empty last page for the shopper.
      expect(total).toBe(3);
    });

    it('is the exact complement of the admin outOfStock worklist', async () => {
      expect(await listNames({ outOfStock: true })).toEqual(['silicone-book']);
    });
  });

  describe('spec facets — OR within a facet (B-10)', () => {
    it('matches a single value (the legacy one-pair form still works)', async () => {
      expect(await listNames({ specFilters: parseSpecFilters('material:Силікон') })).toEqual([
        'silicone-book',
        'silicone-case',
      ]);
    });

    it('UNIONs the values listed inside one facet', async () => {
      expect(await listNames({ specFilters: parseSpecFilters('material:Силікон,TPU') })).toEqual([
        'silicone-book',
        'silicone-case',
        'tpu-case',
      ]);
    });

    it('returns nothing for a value nobody carries', async () => {
      expect(await listNames({ specFilters: parseSpecFilters('material:Титан') })).toEqual([]);
    });
  });

  describe('spec facets — AND between facets (B-10)', () => {
    it('intersects two facets instead of unioning them', async () => {
      const names = await listNames({
        specFilters: parseSpecFilters('material:Силікон,TPU;form:Накладка'),
      });

      // Силікон|TPU ∩ Накладка. `silicone-book` carries Силікон but is a
      // Книжка, so it must be excluded — a single merged `some` would let it in.
      expect(names).toEqual(['silicone-case', 'tpu-case']);
    });

    it('returns nothing when the two facets cannot both be satisfied', async () => {
      expect(
        await listNames({ specFilters: parseSpecFilters('material:Шкіра;form:Накладка') }),
      ).toEqual([]);
    });

    it('never matches a cross-product of one facet key with the other facet value', async () => {
      // The naive "one `some`, keys IN (...), values IN (...)" shape would match
      // `leather-book` here (it has form=Книжка, and Книжка is in the value
      // list) even though no product has material=Книжка at all.
      expect(await listNames({ specFilters: parseSpecFilters('material:Книжка') })).toEqual([]);
    });

    it('composes with inStock', async () => {
      expect(
        await listNames({ specFilters: parseSpecFilters('material:Силікон'), inStock: true }),
      ).toEqual(['silicone-case']);
    });
  });

  describe('spec facets — only real facets narrow (TASK-706)', () => {
    it('matches nothing through a free-text spec, even one left filterable by an old database', async () => {
      expect(await listNames({ specFilters: parseSpecFilters('screen:6.1" OLED') })).toEqual([]);
    });

    it('matches nothing through a spec nobody marked filterable', async () => {
      expect(await listNames({ specFilters: parseSpecFilters('grip:Так') })).toEqual([]);
    });

    it('treats a non-facet key like an unknown key, alongside a real facet', async () => {
      expect(
        await listNames({ specFilters: parseSpecFilters('material:Силікон;screen:6.1" OLED') }),
      ).toEqual([]);
      expect(
        await listNames({ specFilters: parseSpecFilters('material:Силікон;nonexistent:x') }),
      ).toEqual([]);
    });
  });

  /**
   * TASK-2077 / TASK-1953 against the real join table: several device models are
   * OR-ed (a product fitting ANY of them is listed), and the per-page compat-id
   * batch reads back exactly what each product declares.
   *
   *   silicone-case → A        tpu-case → B
   *   leather-book  → A, C     silicone-book → (none)
   */
  describe('device compatibility — OR across models (TASK-2077)', () => {
    let deviceBrandId: string;
    const modelIds: Record<'A' | 'B' | 'C', string> = { A: '', B: '', C: '' };

    function productId(name: string): string {
      const id = [...nameById.entries()].find(([, n]) => n === name)?.[0];
      if (!id) throw new Error(`fixture product ${name} missing`);
      return id;
    }

    beforeAll(async () => {
      const s = randomUUID();
      deviceBrandId = (
        await prisma.deviceBrand.create({ data: { name: 'facet-dev', slug: `facet-dev-${s}` } })
      ).id;
      for (const key of ['A', 'B', 'C'] as const) {
        modelIds[key] = (
          await prisma.deviceModel.create({
            data: { deviceBrandId, name: `facet-dev ${key}`, slug: `facet-dev-${key}-${s}` },
          })
        ).id;
      }
      await prisma.productDeviceCompat.createMany({
        data: [
          { productId: productId('silicone-case'), deviceModelId: modelIds.A },
          { productId: productId('tpu-case'), deviceModelId: modelIds.B },
          { productId: productId('leather-book'), deviceModelId: modelIds.A },
          { productId: productId('leather-book'), deviceModelId: modelIds.C },
        ],
      });
    });

    afterAll(async () => {
      if (!prisma || !deviceBrandId) return;
      await prisma.productDeviceCompat.deleteMany({
        where: { deviceModelId: { in: Object.values(modelIds) } },
      });
      await prisma.deviceModel.deleteMany({ where: { deviceBrandId } });
      await prisma.deviceBrand.deleteMany({ where: { id: deviceBrandId } });
    });

    it('keeps the single-model filter as it was', async () => {
      expect(await listNames({ deviceModelIds: [modelIds.A] })).toEqual([
        'leather-book',
        'silicone-case',
      ]);
    });

    it('UNIONs several models instead of intersecting them', async () => {
      expect(await listNames({ deviceModelIds: [modelIds.A, modelIds.B] })).toEqual([
        'leather-book',
        'silicone-case',
        'tpu-case',
      ]);
    });

    it('lists a product fitting two of the models once', async () => {
      const { products, total } = await productRepo.findAll({
        page: 1,
        limit: 50,
        categoryIds: [categoryId],
        deviceModelIds: [modelIds.A, modelIds.C],
      });
      expect(products.map((p) => p.name).sort()).toEqual(['leather-book', 'silicone-case']);
      expect(total).toBe(2);
    });

    it('composes with inStock and spec facets', async () => {
      expect(
        await listNames({
          deviceModelIds: [modelIds.A, modelIds.B],
          inStock: true,
          specFilters: parseSpecFilters('form:Накладка'),
        }),
      ).toEqual(['silicone-case', 'tpu-case']);
    });

    it('reads back every product’s compat ids in one batch, [] for none (TASK-1953)', async () => {
      const compatRepo = app.get(ProductDeviceCompatRepository);
      const map = await compatRepo.getDeviceModelIdsByProductIds(productIds);

      expect(map.get(productId('silicone-case'))).toEqual([modelIds.A]);
      expect(map.get(productId('tpu-case'))).toEqual([modelIds.B]);
      expect(map.get(productId('leather-book'))?.sort()).toEqual([modelIds.A, modelIds.C].sort());
      expect(map.get(productId('silicone-book'))).toEqual([]);
    });
  });
});
