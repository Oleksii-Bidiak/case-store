import { INestApplication } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { randomUUID } from 'crypto';
import { ProductRepository } from '../src/product/product.repository';
import { parseSpecFilters } from '../src/product/dto/product-list-query.dto';
import { PrismaService } from '../src/prisma';
import { SlugRedirectRepository } from '../src/slug-redirect';

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
      providers: [PrismaService, ProductRepository, SlugRedirectRepository],
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
      data: { categoryId, key: 'material', label: 'Матеріал', isFilterable: true, sortOrder: 0 },
    });
    materialDefId = material.id;

    const form = await prisma.attributeDefinition.create({
      data: { categoryId, key: 'form', label: 'Форм-фактор', isFilterable: true, sortOrder: 1 },
    });
    formDefId = form.id;

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
      where: { id: { in: [materialDefId, formDefId] } },
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
});
