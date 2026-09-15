import { INestApplication } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { randomUUID } from 'crypto';
import { AttributeDefinitionRepository } from '../src/attribute-definition/attribute-definition.repository';
import { AttributeDefinitionService } from '../src/attribute-definition/attribute-definition.service';
import { FilterableSpecsQueryDto } from '../src/attribute-definition/dto';
import { BrandRepository } from '../src/brand/brand.repository';
import { CatalogueFilterResolver } from '../src/catalog-filter/catalogue-filter.resolver';
import { CategoryRepository } from '../src/category/category.repository';
import { DeviceRepository } from '../src/device/device.repository';
import { parseSpecFilters } from '../src/product/dto/product-list-query.dto';
import { ProductRepository } from '../src/product/product.repository';
import { PrismaService } from '../src/prisma';
import { SlugRedirectRepository } from '../src/slug-redirect';

/**
 * Facet value counts against a REAL Postgres — TASK-489, owner decision B-10 §4
 * («Силікон (12)», where 12 accounts for the other filters already selected).
 *
 * ── Why this file has to exist ──────────────────────────────────────────────
 * The substance of the task is a rule a mocked Prisma cannot express, let alone
 * prove: the count beside a value in facet X is computed with every OTHER active
 * filter applied and X's OWN selection lifted. Get that wrong in the obvious way
 * — count everything under the full filter set — and the code still compiles,
 * still type-checks, still passes a `where`-shape unit test, and produces a
 * sidebar where ticking «Силікон» drives «TPU» and «Шкіра» to zero, removes
 * them from the page (a zero is never rendered), and leaves the shopper with a
 * facet they can add to but never change. Only real rows show that.
 *
 * The three things asserted here, in the order plan 182 §Приймання lists them:
 *   1. counts in facet B CHANGE when a value in facet A is selected;
 *   2. counts WITHIN the facet being selected in do NOT collapse to the pick;
 *   3. a value no product in the slice carries is ABSENT — not present at zero.
 * Plus the one the shopper actually feels: the number beside a value equals the
 * listing total they land on after ticking it, which is what the mobile drawer's
 * «Показати N товарів» reads.
 *
 * Fixture (one throwaway category, two filterable definitions):
 *
 *   silicone-case  material=Силікон  form=Накладка   stock 5
 *   tpu-case       material=TPU      form=Накладка   stock 3
 *   leather-book   material=Шкіра    form=Книжка     stock 7
 *   silicone-book  material=Силікон  form=Книжка     stock 0  ← sold out
 *   hidden-case    material=Титан    form=Накладка   stock 9  ← isActive: false
 *
 * The same four products as `product-spec-facets.int-spec.ts` (deliberately
 * overlapping specs, one sold out) plus a deactivated fifth: «Титан» is the
 * value that must never surface, because a facet is a promise about the PUBLIC
 * listing and `getFilterableSpecs` applies the same visibility rules
 * `ProductService.findAll` does.
 *
 * Requires the isolated `*_test` DB (forced by setup-int.ts). Run with
 * `npm run test:int -w apps/store-api`.
 */
describe('Facet value counts: «Силікон (12)» (integration)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let productRepo: ProductRepository;
  let facetService: AttributeDefinitionService;

  let categoryId: string;
  let materialDefId: string;
  let formDefId: string;
  const productIds: string[] = [];

  /**
   * The facets a shopper is offered, flattened to `{ facetKey: { value: count } }`.
   * Goes through the SERVICE, not the repository, so every assertion below also
   * covers the public-visibility scope and the `?specs=` parsing the endpoint
   * applies — which is where a count and a listing would drift apart in practice.
   */
  async function facetCounts(
    query: FilterableSpecsQueryDto = {},
  ): Promise<Record<string, Record<string, number>>> {
    const facets = await facetService.getFilterableSpecs(categoryId, query);
    return Object.fromEntries(
      facets.map((facet) => [
        facet.definition.key,
        Object.fromEntries(facet.values.map((entry) => [entry.value, entry.count])),
      ]),
    );
  }

  /**
   * The total the PUBLIC listing reports for the same filters — the number the
   * mobile drawer's «Показати N товарів» button shows. Mirrors the constants
   * `ProductService.findAll` forces on every public read.
   */
  async function listingTotal(params: { specs?: string; inStock?: boolean } = {}): Promise<number> {
    const { total } = await productRepo.findAll({
      page: 1,
      limit: 50,
      categoryIds: [categoryId],
      isActive: true,
      categoryActiveOnly: true,
      specFilters: parseSpecFilters(params.specs),
      inStock: params.inStock,
    });
    return total;
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
        CategoryRepository,
        AttributeDefinitionRepository,
        AttributeDefinitionService,
        BrandRepository,
        DeviceRepository,
        CatalogueFilterResolver,
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();

    prisma = moduleRef.get(PrismaService);
    productRepo = moduleRef.get(ProductRepository);
    facetService = moduleRef.get(AttributeDefinitionService);

    const s = randomUUID();

    const category = await prisma.category.create({
      data: { name: `count-cases-${s}`, slug: `count-cases-${s}` },
    });
    categoryId = category.id;

    const material = await prisma.attributeDefinition.create({
      data: {
        categoryId,
        key: 'material',
        label: 'Матеріал',
        type: 'SELECT',
        // The declared option list deliberately holds a value NO product uses.
        // Before this task the facet was built from exactly this list, so a
        // shopper could tick «Кевлар» and land on an empty page.
        options: ['Силікон', 'TPU', 'Шкіра', 'Титан', 'Кевлар'],
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
        options: ['Накладка', 'Книжка'],
        isFilterable: true,
        sortOrder: 1,
      },
    });
    formDefId = form.id;

    const fixtures: Array<{
      name: string;
      material: string;
      form: string;
      stock: number;
      isActive?: boolean;
    }> = [
      { name: 'silicone-case', material: 'Силікон', form: 'Накладка', stock: 5 },
      { name: 'tpu-case', material: 'TPU', form: 'Накладка', stock: 3 },
      { name: 'leather-book', material: 'Шкіра', form: 'Книжка', stock: 7 },
      { name: 'silicone-book', material: 'Силікон', form: 'Книжка', stock: 0 },
      { name: 'hidden-case', material: 'Титан', form: 'Накладка', stock: 9, isActive: false },
    ];

    for (const fixture of fixtures) {
      const product = await prisma.product.create({
        data: {
          name: fixture.name,
          slug: `${fixture.name}-${s}`,
          price: '19.99',
          stock: fixture.stock,
          isActive: fixture.isActive ?? true,
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

  describe('the unfiltered catalogue', () => {
    it('counts the products behind every value in use', async () => {
      expect(await facetCounts()).toEqual({
        material: { Силікон: 2, TPU: 1, Шкіра: 1 },
        form: { Книжка: 2, Накладка: 2 },
      });
    });

    it('never offers a declared option nothing carries («Кевлар»)', async () => {
      // The whole point of the task: the values come from the PRODUCTS, not from
      // the definition's `options`. A value with no products is absent, not
      // rendered at zero — there is nothing to tick that leads nowhere.
      const counts = await facetCounts();
      expect(Object.keys(counts.material)).not.toContain('Кевлар');
      expect(counts.material.Кевлар).toBeUndefined();
    });

    it('never offers a value only a DEACTIVATED product carries («Титан»)', async () => {
      // A facet is a promise about the public listing, so it inherits the
      // listing's visibility rules — otherwise the sidebar advertises stock the
      // storefront refuses to show.
      expect(Object.keys((await facetCounts()).material)).not.toContain('Титан');
    });

    it("a facet's counts sum to the listing total", async () => {
      const counts = await facetCounts();
      const sum = Object.values(counts.material).reduce((a, b) => a + b, 0);

      // True HERE because every product carries exactly one value per facet —
      // `@@unique([productId, definitionId])` guarantees at most one, and this
      // fixture always writes one. It is NOT a general law: a catalogue where a
      // product may file two values under one key (an ancestor's definition and
      // a leaf's override of it) would sum to more than the total, which is why
      // the code counts rows per definition rather than trusting the sum.
      expect(sum).toBe(await listingTotal());
      expect(sum).toBe(4);
    });
  });

  describe('a selection in one facet re-counts the OTHER facet (плану 182 §489)', () => {
    it('narrows facet B when a value in facet A is picked', async () => {
      const before = await facetCounts();
      const after = await facetCounts({ specs: 'form:Накладка' });

      // Before: Силікон 2 (case + book). After: only the Накладка one survives.
      expect(before.material).toEqual({ Силікон: 2, TPU: 1, Шкіра: 1 });
      expect(after.material).toEqual({ Силікон: 1, TPU: 1 });
    });

    it('DROPS a value nothing in the narrowed slice carries, rather than zeroing it', async () => {
      // «Шкіра» exists in the category but only on a Книжка. Under form=Накладка
      // it has no products — and a value with no products is not a row.
      const after = await facetCounts({ specs: 'form:Накладка' });
      expect(Object.keys(after.material)).toEqual(['TPU', 'Силікон']);
      expect(after.material.Шкіра).toBeUndefined();
    });

    it('re-counts the other direction too — picking a material re-counts the forms', async () => {
      expect((await facetCounts({ specs: 'material:Силікон' })).form).toEqual({
        Книжка: 1,
        Накладка: 1,
      });
      expect((await facetCounts({ specs: 'material:Шкіра' })).form).toEqual({ Книжка: 1 });
    });
  });

  describe("a facet's OWN selection is lifted from its OWN counts", () => {
    it('leaves the other values of the selected facet countable', async () => {
      // THE regression this test exists for. Counting «form» under the full
      // filter set would give { Накладка: 2 } and nothing else — «Книжка» would
      // vanish from the sidebar the instant «Накладка» was ticked, and the
      // shopper could never switch, only clear.
      expect((await facetCounts({ specs: 'form:Накладка' })).form).toEqual({
        Книжка: 2,
        Накладка: 2,
      });
    });

    it('lifts only THAT facet, keeping every other selection applied', async () => {
      // material=Силікон is still applied while form is counted, so the forms
      // are the two Силікон products' forms — not the whole category's.
      expect((await facetCounts({ specs: 'material:Силікон;form:Накладка' })).form).toEqual({
        Книжка: 1,
        Накладка: 1,
      });
      // …and symmetrically, material is counted with form=Накладка applied and
      // its own Силікон pick lifted.
      expect((await facetCounts({ specs: 'material:Силікон;form:Накладка' })).material).toEqual({
        Силікон: 1,
        TPU: 1,
      });
    });

    it('keeps a multi-value pick inside one facet from narrowing that facet', async () => {
      // OR within a facet: both values ticked, and the facet still reports the
      // whole category's forms because its own entry is lifted either way.
      expect((await facetCounts({ specs: 'form:Накладка,Книжка' })).form).toEqual({
        Книжка: 2,
        Накладка: 2,
      });
    });
  });

  describe('the counts respect the non-facet filters too', () => {
    it('applies inStock', async () => {
      // silicone-book is sold out, so Силікон drops from 2 to 1 and Книжка from
      // 2 to 1 — without it the sidebar would advertise a position «В наявності»
      // then refuses to list.
      expect(await facetCounts({ inStock: true })).toEqual({
        material: { Силікон: 1, TPU: 1, Шкіра: 1 },
        form: { Книжка: 1, Накладка: 2 },
      });
    });

    it('composes inStock with a facet selection', async () => {
      expect((await facetCounts({ inStock: true, specs: 'form:Книжка' })).material).toEqual({
        Шкіра: 1,
      });
    });

    it('applies a price range', async () => {
      // Every fixture product is 19.99, so a window above it empties the sidebar
      // entirely — a facet with no values is dropped, not rendered empty.
      expect(await facetCounts({ minPrice: 100 })).toEqual({});
    });

    it('applies a keyword search', async () => {
      expect(await facetCounts({ search: 'leather' })).toEqual({
        material: { Шкіра: 1 },
        form: { Книжка: 1 },
      });
    });
  });

  describe('the number beside a value is the page the shopper lands on', () => {
    it("matches the listing total after ticking it — the drawer's «Показати N товарів»", async () => {
      // A shopper reading «Силікон (2)» and getting a page of 8 is the bug this
      // check rules out. Ticking a value in a facet with nothing selected yet
      // makes the listing exactly that count, because the count was computed
      // over "everything else" and the tick adds precisely that one predicate.
      const counts = await facetCounts();
      for (const [value, count] of Object.entries(counts.material)) {
        expect(await listingTotal({ specs: `material:${value}` })).toBe(count);
      }
    });

    it('matches with another facet already narrowing the page', async () => {
      const counts = await facetCounts({ specs: 'form:Накладка' });
      for (const [value, count] of Object.entries(counts.material)) {
        expect(await listingTotal({ specs: `form:Накладка;material:${value}` })).toBe(count);
      }
    });

    it('matches with inStock on', async () => {
      const counts = await facetCounts({ inStock: true });
      for (const [value, count] of Object.entries(counts.form)) {
        expect(await listingTotal({ specs: `form:${value}`, inStock: true })).toBe(count);
      }
    });

    it('is a LOWER bound, not an equality, when the facet already has a pick', async () => {
      // Deliberate and correct: values inside one facet are OR-ed, so ticking a
      // second one WIDENS the page. The count promises "this many carry this
      // value", and the union is at least that. Spelled out here because it is
      // the one case where number-beside-value and button-number legitimately
      // differ, and a future reader will otherwise call it a bug.
      const counts = await facetCounts({ specs: 'material:Шкіра' });
      const union = await listingTotal({ specs: 'material:Шкіра,Силікон' });

      expect(counts.material.Силікон).toBe(2);
      expect(union).toBe(3);
      expect(union).toBeGreaterThanOrEqual(counts.material.Силікон);
    });
  });
});
