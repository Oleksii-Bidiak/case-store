import { INestApplication } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { randomUUID } from 'crypto';
import { readFileSync } from 'fs';
import { join } from 'path';
import { AttributeDefinitionRepository } from '../src/attribute-definition/attribute-definition.repository';
import { AttributeDefinitionService } from '../src/attribute-definition/attribute-definition.service';
import { CategoryRepository } from '../src/category/category.repository';
import { PrismaService } from '../src/prisma';
import { SlugRedirectRepository } from '../src/slug-redirect';
import { BrandRepository } from '../src/brand/brand.repository';
import { DeviceRepository } from '../src/device/device.repository';
import { CatalogueFilterResolver } from '../src/catalog-filter/catalogue-filter.resolver';

/**
 * The widened facet set, against a REAL Postgres (TASK-488 / owner decision
 * B-10).
 *
 * ── What this file is for ───────────────────────────────────────────────────
 * Two guarantees that only a real database can give:
 *
 *   1. **TEXT is never a facet.** The rule is enforced in three places — the
 *      write path (`validateFacetType`), the read path (`getFilterableSpecs`)
 *      and the backfill below — and the read path is the one that matters for
 *      rows that predate the rule: the XLSX import types every column it meets
 *      as TEXT. This is the int-test plan 182 §Приймання asks for by name.
 *   2. **The shipped migration actually matches rows.** It is read off disk and
 *      executed verbatim, exactly as `color-facet-backfill.int-spec.ts` does —
 *      `store_test` is schema-synced (`prisma db push`), so migrations do not
 *      run here, and a TypeScript re-implementation would test a copy while the
 *      SQL that ships stays unexercised. This repository has already shipped a
 *      conditional backfill whose predicate matched nothing, committed silently
 *      and could never run again (plan 180 / 181), so the fixture is built in
 *      the PRE-backfill state and the first assertion is that something changed.
 *
 * Requires the isolated `*_test` DB (forced by setup-int.ts). Run with
 * `npm run test:int -w apps/store-api`.
 */

const MIGRATION_SQL = join(
  __dirname,
  '..',
  'prisma',
  'migrations',
  '20260915180000_widen_catalogue_facets',
  'migration.sql',
);

/**
 * Split the migration file into executable statements — `$executeRawUnsafe`
 * goes through a prepared statement and refuses more than one command at a
 * time. Comments are stripped and the file is split on the terminator; no
 * statement in it contains a `;` inside a string literal, which is what makes
 * this safe and is worth keeping true if the migration is ever edited.
 */
function migrationStatements(): string[] {
  return readFileSync(MIGRATION_SQL, 'utf8')
    .split('\n')
    .filter((line) => !line.trimStart().startsWith('--'))
    .join('\n')
    .split(';')
    .map((statement) => statement.trim())
    .filter((statement) => statement.length > 0);
}

describe('Widening the catalogue facet set: backfill + the TEXT rule (integration)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let facetService: AttributeDefinitionService;

  const suffix = randomUUID();
  const categoryIds: Record<string, string> = {};
  const definitionIds: Record<string, string> = {};
  const productIds: string[] = [];

  /** The facet keys a shopper is offered in this category, in sidebar order. */
  async function facetKeys(categoryId: string): Promise<string[]> {
    const facets = await facetService.getFilterableSpecs(categoryId);
    return facets.map((facet) => facet.definition.key);
  }

  /** The VALUES of one facet (their TASK-489 counts are asserted elsewhere). */
  async function facetValues(categoryId: string, key: string): Promise<string[]> {
    const facets = await facetService.getFilterableSpecs(categoryId);
    const facet = facets.find((entry) => entry.definition.key === key);
    return (facet?.values ?? []).map((entry) => entry.value);
  }

  async function definitionByKey(categoryId: string, key: string) {
    return prisma.attributeDefinition.findUnique({
      where: { categoryId_key: { categoryId, key } },
    });
  }

  /** Spec values of one product, keyed by definition key. */
  async function specsOf(productId: string): Promise<Record<string, string>> {
    const rows = await prisma.productAttributeValue.findMany({
      where: { productId },
      select: { value: true, definition: { select: { key: true } } },
    });
    return Object.fromEntries(rows.map((row) => [row.definition.key, row.value]));
  }

  async function makeCategory(name: string, parentId?: string): Promise<string> {
    const category = await prisma.category.create({
      data: { name: `${name}-${suffix}`, slug: `${name}-${suffix}`, parentId: parentId ?? null },
    });
    categoryIds[name] = category.id;
    return category.id;
  }

  async function makeDefinition(
    categoryId: string,
    data: {
      key: string;
      label: string;
      type: 'TEXT' | 'NUMBER' | 'BOOLEAN' | 'SELECT';
      unit?: string;
      options?: string[];
      isFilterable?: boolean;
      sortOrder: number;
    },
  ): Promise<string> {
    const definition = await prisma.attributeDefinition.create({
      data: {
        categoryId,
        key: data.key,
        label: data.label,
        type: data.type,
        unit: data.unit ?? null,
        options: data.options ?? undefined,
        isFilterable: data.isFilterable ?? false,
        sortOrder: data.sortOrder,
      },
    });
    definitionIds[`${categoryId}:${data.key}`] = definition.id;
    return definition.id;
  }

  async function makeProduct(
    name: string,
    categoryId: string,
    specs: Record<string, string>,
    definitionCategoryId = categoryId,
  ): Promise<string> {
    const product = await prisma.product.create({
      data: {
        name: `${name}-${suffix}`,
        slug: `${name}-${suffix}`,
        price: '19.99',
        stock: 5,
        categoryId,
        specValues: {
          create: Object.entries(specs).map(([key, value]) => ({
            definitionId: definitionIds[`${definitionCategoryId}:${key}`],
            value,
          })),
        },
      },
    });
    productIds.push(product.id);
    return product.id;
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
    facetService = moduleRef.get(AttributeDefinitionService);

    // ── Four roots in the PRE-TASK-488 state, each recognisable only by the
    //    definition KEYS it declares — which is exactly how the migration finds
    //    them, since it refuses to look up a category by slug.
    const cases = await makeCategory('facet-cases');
    const casesLeaf = await makeCategory('facet-iphone-cases', cases);
    const protectors = await makeCategory('facet-protectors');
    const chargers = await makeCategory('facet-chargers');
    const headphones = await makeCategory('facet-headphones');

    await makeDefinition(cases, {
      key: 'case-type',
      label: 'Тип чохла',
      type: 'SELECT',
      options: ['Накладка', 'Книжка'],
      isFilterable: true,
      sortOrder: 0,
    });
    await makeDefinition(cases, {
      key: 'magsafe',
      label: 'Підтримка MagSafe',
      type: 'BOOLEAN',
      sortOrder: 1,
    });
    // The illegal row: filled in, flagged filterable, and free text. Written
    // directly through Prisma because the SERVICE now refuses this pair — which
    // is the point: this is what an imported catalogue already looks like.
    await makeDefinition(cases, {
      key: 'protection',
      label: 'Захист',
      type: 'TEXT',
      isFilterable: true,
      sortOrder: 2,
    });

    await makeDefinition(protectors, {
      key: 'protector-type',
      label: 'Тип захисту',
      type: 'SELECT',
      options: ['Гартоване скло', 'Гідрогелева плівка'],
      isFilterable: true,
      sortOrder: 0,
    });
    await makeDefinition(protectors, {
      key: 'hardness',
      label: 'Твердість',
      type: 'TEXT',
      sortOrder: 1,
    });

    await makeDefinition(chargers, {
      key: 'charger-type',
      label: 'Тип',
      type: 'SELECT',
      options: ['Мережева', 'Бездротова'],
      isFilterable: true,
      sortOrder: 0,
    });
    await makeDefinition(chargers, {
      key: 'ports',
      label: 'Кількість портів',
      type: 'NUMBER',
      unit: 'шт',
      sortOrder: 1,
    });
    await makeDefinition(chargers, {
      key: 'technology',
      label: 'Технологія',
      type: 'SELECT',
      options: ['GaN', 'Power Delivery'],
      sortOrder: 2,
    });

    await makeDefinition(headphones, {
      key: 'headphone-type',
      label: 'Тип',
      type: 'SELECT',
      options: ['Вкладиші TWS', 'Повнорозмірні'],
      isFilterable: true,
      sortOrder: 0,
    });
    await makeDefinition(headphones, {
      key: 'anc',
      label: 'Активне шумозаглушення',
      type: 'BOOLEAN',
      sortOrder: 1,
    });

    // Products sit in the LEAF for cases, so every read goes through the
    // root→subtree inheritance the real catalogue relies on.
    await makeProduct(
      'facet-case-magsafe',
      casesLeaf,
      { 'case-type': 'Накладка', magsafe: 'true', protection: 'Посилені кути Air Cushion' },
      cases,
    );
    await makeProduct(
      'facet-case-book',
      casesLeaf,
      { 'case-type': 'Книжка', magsafe: 'false', protection: 'Повне закриття екрана' },
      cases,
    );

    await makeProduct('facet-glass', protectors, {
      'protector-type': 'Гартоване скло',
      hardness: '9H, товщина 0.33 мм',
    });
    await makeProduct('facet-film', protectors, {
      'protector-type': 'Гідрогелева плівка',
      hardness: 'Матове антивідблискове покриття',
    });

    await makeProduct('facet-charger-wall', chargers, {
      'charger-type': 'Мережева',
      ports: '2',
      technology: 'GaN',
    });
    await makeProduct('facet-charger-wireless', chargers, {
      'charger-type': 'Бездротова',
      ports: '1',
      technology: 'Power Delivery',
    });

    await makeProduct('facet-buds', headphones, {
      'headphone-type': 'Вкладиші TWS',
      anc: 'true',
    });
    await makeProduct('facet-overear', headphones, {
      'headphone-type': 'Повнорозмірні',
      anc: 'false',
    });
  });

  afterAll(async () => {
    if (!prisma) {
      return;
    }
    const ids = Object.values(categoryIds);
    await prisma.productAttributeValue.deleteMany({ where: { productId: { in: productIds } } });
    await prisma.product.deleteMany({ where: { id: { in: productIds } } });
    await prisma.attributeDefinition.deleteMany({ where: { categoryId: { in: ids } } });
    // Children before parents — `categories.parent_id` is a real FK.
    await prisma.category.deleteMany({ where: { id: categoryIds['facet-iphone-cases'] } });
    await prisma.category.deleteMany({ where: { id: { in: ids } } });
    await app.close();
  });

  describe('TEXT is never a facet — before anything is migrated', () => {
    it('drops a filterable TEXT definition from filterable-specs', async () => {
      // «Захист» IS flagged filterable in the database and DOES have values on
      // both products — the only thing keeping it out of the sidebar is the
      // type rule. Without it the shopper gets a filter offering «Посилені кути
      // Air Cushion» and «Повне закриття екрана»: one value per product.
      const protection = await definitionByKey(categoryIds['facet-cases'], 'protection');
      expect(protection?.isFilterable).toBe(true);
      expect(protection?.type).toBe('TEXT');

      expect(await facetKeys(categoryIds['facet-cases'])).toEqual(['case-type']);
      expect(await facetKeys(categoryIds['facet-iphone-cases'])).toEqual(['case-type']);
    });

    it('offers only the two facets that were flagged before B-10', async () => {
      expect(await facetKeys(categoryIds['facet-chargers'])).toEqual(['charger-type']);
      expect(await facetKeys(categoryIds['facet-headphones'])).toEqual(['headphone-type']);
      expect(await facetKeys(categoryIds['facet-protectors'])).toEqual(['protector-type']);
    });
  });

  describe('the shipped migration, executed verbatim', () => {
    beforeAll(async () => {
      for (const statement of migrationStatements()) {
        await prisma.$executeRawUnsafe(statement);
      }
    });

    it('promoted the attributes that were filled in but never flagged', async () => {
      // The assertion this project learned to write the hard way: a conditional
      // backfill whose predicate matches nothing commits quietly and never runs
      // again. Three flags go in false; three must come out true.
      expect((await definitionByKey(categoryIds['facet-cases'], 'magsafe'))?.isFilterable).toBe(
        true,
      );
      expect((await definitionByKey(categoryIds['facet-headphones'], 'anc'))?.isFilterable).toBe(
        true,
      );
      expect(
        (await definitionByKey(categoryIds['facet-chargers'], 'technology'))?.isFilterable,
      ).toBe(true);
    });

    it('un-flagged the TEXT definition that could never be a facet', async () => {
      const protection = await definitionByKey(categoryIds['facet-cases'], 'protection');
      expect(protection?.isFilterable).toBe(false);
      // …and its values are untouched: the PDP still shows «Захист».
      expect((await specsOf(productIds[0]))['protection']).toBe('Посилені кути Air Cushion');
    });

    it('retyped «Кількість портів» NUMBER → SELECT and gave it its options', async () => {
      const ports = await definitionByKey(categoryIds['facet-chargers'], 'ports');
      expect(ports?.type).toBe('SELECT');
      expect(ports?.isFilterable).toBe(true);
      expect(ports?.options).toEqual(['1', '2']);
      // The stored values did not move, so the PDP row is unchanged.
      expect((await specsOf(productIds[4]))['ports']).toBe('2');
    });

    it('split «Твердість» into a class and the descriptive remainder', async () => {
      const hardness = await definitionByKey(categoryIds['facet-protectors'], 'hardness');
      expect(hardness?.type).toBe('SELECT');
      expect(hardness?.isFilterable).toBe(true);
      expect(hardness?.options).toEqual(['9H']);

      const features = await definitionByKey(categoryIds['facet-protectors'], 'protector-features');
      expect(features?.type).toBe('TEXT');
      expect(features?.isFilterable).toBe(false);

      const glass = await specsOf(productIds[2]);
      expect(glass['hardness']).toBe('9H');
      // Nothing the PDP used to show was lost in the retype.
      expect(glass['protector-features']).toBe('Товщина 0.33 мм');

      const film = await specsOf(productIds[3]);
      // A hydrogel film has no hardness class at all — better no value than a
      // sentence in a facet.
      expect(film['hardness']).toBeUndefined();
      expect(film['protector-features']).toBe('Матове антивідблискове покриття');
    });

    it('declared the three definitions B-10 added, on the right categories', async () => {
      const bundle = await definitionByKey(categoryIds['facet-cases'], 'bundle');
      const microphone = await definitionByKey(categoryIds['facet-headphones'], 'microphone');
      const output = await definitionByKey(categoryIds['facet-chargers'], 'charger-output');

      expect(bundle).toMatchObject({ type: 'SELECT', isFilterable: true, label: 'Комплектація' });
      expect(microphone).toMatchObject({ type: 'SELECT', isFilterable: true, label: 'Мікрофон' });
      expect(output).toMatchObject({ type: 'SELECT', isFilterable: true });

      // Each landed on the category that declares its SIBLING key, and nowhere
      // else: no slug was consulted and no unrelated root was touched.
      expect(await definitionByKey(categoryIds['facet-chargers'], 'bundle')).toBeNull();
      expect(await definitionByKey(categoryIds['facet-iphone-cases'], 'bundle')).toBeNull();
    });

    it('derived the one output connector that IS derivable', async () => {
      // A wireless charger has no output socket; every other connector would be
      // a guess about the product, so the migration leaves those to an operator.
      expect((await specsOf(productIds[5]))['charger-output']).toBe('Бездротовий');
      expect((await specsOf(productIds[4]))['charger-output']).toBeUndefined();
    });

    it('is idempotent — a second run writes nothing new', async () => {
      const before = await prisma.productAttributeValue.count({
        where: { productId: { in: productIds } },
      });
      const definitionsBefore = await prisma.attributeDefinition.count({
        where: { categoryId: { in: Object.values(categoryIds) } },
      });

      for (const statement of migrationStatements()) {
        await prisma.$executeRawUnsafe(statement);
      }

      expect(
        await prisma.productAttributeValue.count({ where: { productId: { in: productIds } } }),
      ).toBe(before);
      expect(
        await prisma.attributeDefinition.count({
          where: { categoryId: { in: Object.values(categoryIds) } },
        }),
      ).toBe(definitionsBefore);
      // And the split did not run twice: «9H» stayed «9H» rather than becoming ''.
      expect((await specsOf(productIds[2]))['hardness']).toBe('9H');
    });
  });

  describe('after the backfill — what the shopper is offered', () => {
    it('offers the widened set in sortOrder, and still no TEXT', async () => {
      expect(await facetKeys(categoryIds['facet-cases'])).toEqual(['case-type', 'magsafe']);
      // «Комплектація» exists but nothing carries a value yet, so it is NOT
      // rendered — an empty control reads as a broken page, not as a filter.
      expect(await facetKeys(categoryIds['facet-chargers'])).toEqual([
        'charger-type',
        'ports',
        'technology',
        'charger-output',
      ]);
      expect(await facetKeys(categoryIds['facet-protectors'])).toEqual([
        'protector-type',
        'hardness',
      ]);
      expect(await facetKeys(categoryIds['facet-headphones'])).toEqual(['headphone-type', 'anc']);
    });

    it('renders the BOOLEAN facet as its two stored values', async () => {
      // «Так»/«Ні» is the storefront's job (`formatFacetValue`); the API's job
      // is to report the closed value set, which is what makes it a facet.
      expect(await facetValues(categoryIds['facet-cases'], 'magsafe')).toEqual(['false', 'true']);
    });

    it('inherits the widened facets into the child category', async () => {
      expect(await facetKeys(categoryIds['facet-iphone-cases'])).toEqual(['case-type', 'magsafe']);
    });

    it('keeps dropping a TEXT facet even when a row re-flags one', async () => {
      // The guarantee plan 182 asks for, stated once more against the state the
      // backfill leaves behind: re-flag «Захист» exactly as an import or a hand
      // edit would, and it STILL never reaches `filterable-specs`.
      await prisma.attributeDefinition.update({
        where: { categoryId_key: { categoryId: categoryIds['facet-cases'], key: 'protection' } },
        data: { isFilterable: true },
      });

      expect(await facetKeys(categoryIds['facet-cases'])).toEqual(['case-type', 'magsafe']);
      expect(await facetKeys(categoryIds['facet-iphone-cases'])).toEqual(['case-type', 'magsafe']);
    });
  });
});
