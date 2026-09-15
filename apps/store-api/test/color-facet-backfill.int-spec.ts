import { INestApplication } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { randomUUID } from 'crypto';
import { readFileSync } from 'fs';
import { join } from 'path';
import { AttributeDefinitionRepository } from '../src/attribute-definition/attribute-definition.repository';
import { AttributeDefinitionService } from '../src/attribute-definition/attribute-definition.service';
import { CategoryRepository } from '../src/category/category.repository';
import { COLOR_SPEC_KEY } from '../src/common/color-axis';
import { parseSpecFilters } from '../src/product/dto/product-list-query.dto';
import { ProductRepository } from '../src/product/product.repository';
import { PrismaService } from '../src/prisma';
import { SlugRedirectRepository } from '../src/slug-redirect';

/**
 * The colour bridge, end to end, against a REAL Postgres (TASK-487).
 *
 * ── Why this file exists ────────────────────────────────────────────────────
 * Colour lived only in `products.attributes`, a free-form JSON column. Facets
 * read `product_attribute_values`. NOTHING joined the two, which is why
 * `?specs=color:…` and `filterable-specs` were blind to the strongest facet in
 * accessories. The fix has two halves and this test covers the half no mock can
 * speak for: the SHIPPED backfill migration, executed verbatim, against rows it
 * has never seen.
 *
 * ── Why the migration file is read off disk ─────────────────────────────────
 * `store_test` is schema-synced (`prisma db push`), so migrations do not run
 * here. A re-implementation of the backfill in TypeScript would test a copy and
 * leave the SQL that actually ships on the client's stand unexercised. So the
 * `.sql` is read, split and executed as written — if it is malformed, or if its
 * `WHERE` matches nothing, this test is where that shows up.
 *
 * That last part is the point. This repository has shipped a conditional
 * backfill whose predicate matched zero rows, committed silently, and could
 * never run again (plan 180 / 181). The fixture below is therefore built in the
 * PRE-backfill state — colour in the JSON, no `color` definition, no spec value
 * anywhere — and the first assertion is that the migration CHANGED something.
 *
 * Requires the isolated `*_test` DB (forced by setup-int.ts). Run with
 * `npm run test:int -w apps/store-api`.
 */

const MIGRATION_SQL = join(
  __dirname,
  '..',
  'prisma',
  'migrations',
  '20260915140000_backfill_color_facet',
  'migration.sql',
);

/**
 * Split the migration file into executable statements.
 *
 * Prisma's `$executeRawUnsafe` goes through a prepared statement, which refuses
 * more than one command at a time — so the file is stripped of its `--` comments
 * and split on the statement terminator. No statement in it contains a `;`
 * inside a string literal, which is what makes this safe (and is worth keeping
 * true if the migration is ever edited).
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

describe('Colour as a catalogue facet: backfill + bridge (integration)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let productRepo: ProductRepository;
  let facetService: AttributeDefinitionService;
  let definitionRepo: AttributeDefinitionRepository;

  const suffix = randomUUID();
  let rootId: string;
  let leafId: string;
  /** A second leaf under the same root whose products have no colour at all. */
  let colourlessLeafId: string;
  let groupId: string;
  let materialDefId: string;
  const productIds: string[] = [];

  async function listNames(
    params: Partial<Parameters<ProductRepository['findAll']>[0]> = {},
  ): Promise<string[]> {
    const { products } = await productRepo.findAll({
      page: 1,
      limit: 50,
      categoryIds: [rootId, leafId, colourlessLeafId],
      ...params,
    });
    return products.map((product) => product.name).sort();
  }

  /** Every spec value currently filed under the `color` key, by product name. */
  async function storedColors(): Promise<Record<string, string>> {
    const rows = await prisma.productAttributeValue.findMany({
      where: { productId: { in: productIds }, definition: { key: COLOR_SPEC_KEY } },
      select: { value: true, product: { select: { name: true } } },
    });
    return Object.fromEntries(rows.map((row) => [row.product.name, row.value]));
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
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();

    prisma = moduleRef.get(PrismaService);
    productRepo = moduleRef.get(ProductRepository);
    facetService = moduleRef.get(AttributeDefinitionService);
    definitionRepo = moduleRef.get(AttributeDefinitionRepository);

    // ── A two-level tree, exactly like the real catalogue: «Чохли» (root) with
    //    «Чохли для iPhone» and «Плівки» under it. Definitions belong on the
    //    ROOT, which is what makes the backfill's ancestor walk load-bearing.
    const root = await prisma.category.create({
      data: { name: 'colour-root', slug: `colour-root-${suffix}` },
    });
    rootId = root.id;

    const leaf = await prisma.category.create({
      data: { name: 'colour-leaf', slug: `colour-leaf-${suffix}`, parentId: rootId },
    });
    leafId = leaf.id;

    const colourless = await prisma.category.create({
      data: { name: 'colourless-leaf', slug: `colourless-leaf-${suffix}`, parentId: rootId },
    });
    colourlessLeafId = colourless.id;

    // A pre-existing, unrelated facet: the colour definition must be ADDED
    // beside it, not instead of it, and must sort ahead of it.
    const material = await prisma.attributeDefinition.create({
      data: {
        categoryId: rootId,
        key: 'material',
        label: 'Матеріал',
        isFilterable: true,
        sortOrder: 0,
      },
    });
    materialDefId = material.id;

    const group = await prisma.productGroup.create({
      data: { name: `colour-group-${suffix}`, axes: { create: [{ name: 'Колір', sortOrder: 0 }] } },
    });
    groupId = group.id;

    // The PRE-backfill state, which is the state every existing database is in:
    // a colour in the variant-axis JSON, spelled three different ways, and not a
    // single `color` spec value anywhere.
    const fixtures: Array<{
      name: string;
      categoryId: string;
      attributes: Record<string, string>;
      material: string;
      grouped: boolean;
    }> = [
      {
        name: 'case-black',
        categoryId: leafId,
        attributes: { Колір: 'Чорний' },
        material: 'Силікон',
        grouped: true,
      },
      {
        name: 'case-white',
        categoryId: leafId,
        attributes: { Колір: 'Білий' },
        material: 'Силікон',
        grouped: true,
      },
      {
        // The import's spelling, and a second axis alongside it.
        name: 'case-import-blue',
        categoryId: leafId,
        attributes: { color: 'Синій', Розмір: 'L' },
        material: 'TPU',
        grouped: false,
      },
      {
        // Colour on the ROOT category itself, not in a child.
        name: 'root-black',
        categoryId: rootId,
        attributes: { colour: 'Чорний' },
        material: 'TPU',
        grouped: false,
      },
      {
        // No colour axis at all — must not gain a value, and must keep the
        // colourless leaf out of the colour facet entirely.
        name: 'film-plain',
        categoryId: colourlessLeafId,
        attributes: {},
        material: 'Скло',
        grouped: false,
      },
      {
        // A blank colour is not a colour.
        name: 'case-blank',
        categoryId: leafId,
        attributes: { Колір: '   ' },
        material: 'TPU',
        grouped: false,
      },
    ];

    for (const fixture of fixtures) {
      const product = await prisma.product.create({
        data: {
          name: fixture.name,
          slug: `${fixture.name}-${suffix}`,
          price: '19.99',
          stock: 5,
          categoryId: fixture.categoryId,
          groupId: fixture.grouped ? groupId : null,
          attributes: fixture.attributes,
          specValues: { create: [{ definitionId: materialDefId, value: fixture.material }] },
        },
      });
      productIds.push(product.id);
    }
  });

  afterAll(async () => {
    if (!prisma) {
      return;
    }
    await prisma.productAttributeValue.deleteMany({ where: { productId: { in: productIds } } });
    await prisma.product.deleteMany({ where: { id: { in: productIds } } });
    await prisma.attributeDefinition.deleteMany({
      where: { categoryId: { in: [rootId, leafId, colourlessLeafId] } },
    });
    await prisma.productGroup.deleteMany({ where: { id: groupId } });
    // Children before the parent — `categories.parent_id` is a real FK.
    await prisma.category.deleteMany({ where: { id: { in: [leafId, colourlessLeafId] } } });
    await prisma.category.deleteMany({ where: { id: rootId } });
    await app.close();
  });

  describe('before the backfill — the defect, reproduced', () => {
    it('has colours in the JSON that no facet query can see', async () => {
      const definition = await prisma.attributeDefinition.findUnique({
        where: { categoryId_key: { categoryId: rootId, key: COLOR_SPEC_KEY } },
      });
      expect(definition).toBeNull();

      expect(await storedColors()).toEqual({});
      expect(await listNames({ specFilters: parseSpecFilters('color:Чорний') })).toEqual([]);

      const facets = await facetService.getFilterableSpecs(rootId);
      expect(facets.map((facet) => facet.definition.key)).toEqual(['material']);
    });
  });

  describe('the shipped migration, executed verbatim', () => {
    beforeAll(async () => {
      for (const statement of migrationStatements()) {
        await prisma.$executeRawUnsafe(statement);
      }
    });

    it('matched real rows — the backfill is not a silent no-op', async () => {
      // The assertion this project learned to write the hard way: a conditional
      // backfill whose predicate matches nothing commits quietly and never runs
      // again. Three coloured products go in; three colour values must come out.
      expect(await storedColors()).toEqual({
        'case-black': 'Чорний',
        'case-white': 'Білий',
        'case-import-blue': 'Синій',
        'root-black': 'Чорний',
      });
    });

    it('declares the definition on the ROOT, so the facet survives stepping up a level', async () => {
      const definition = await prisma.attributeDefinition.findUnique({
        where: { categoryId_key: { categoryId: rootId, key: COLOR_SPEC_KEY } },
      });
      expect(definition).not.toBeNull();
      expect(definition?.isFilterable).toBe(true);
      expect(definition?.type).toBe('SELECT');
      expect(definition?.label).toBe('Колір');
      // Nothing was declared on the leaf: one definition, inherited downward.
      expect(
        await prisma.attributeDefinition.findUnique({
          where: { categoryId_key: { categoryId: leafId, key: COLOR_SPEC_KEY } },
        }),
      ).toBeNull();
    });

    it('fills the SELECT options from the colours actually in use', async () => {
      const definition = await prisma.attributeDefinition.findUnique({
        where: { categoryId_key: { categoryId: rootId, key: COLOR_SPEC_KEY } },
      });
      // A closed dropdown missing a stored value is a colour the admin panel
      // cannot re-pick. Sorted, de-duplicated, and blank-free.
      expect(definition?.options).toEqual(['Білий', 'Синій', 'Чорний']);
    });

    it('sorts colour ahead of the facet that was already there', async () => {
      const definition = await prisma.attributeDefinition.findUnique({
        where: { categoryId_key: { categoryId: rootId, key: COLOR_SPEC_KEY } },
      });
      const material = await prisma.attributeDefinition.findUnique({
        where: { id: materialDefId },
      });
      expect(definition!.sortOrder).toBeLessThan(material!.sortOrder);
    });

    it('leaves the pre-existing facet untouched', async () => {
      const material = await prisma.attributeDefinition.findUnique({
        where: { id: materialDefId },
      });
      expect(material?.isFilterable).toBe(true);
      expect(material?.label).toBe('Матеріал');
    });

    it('gives no colour to a product that has none, and none to a blank one', async () => {
      const colors = await storedColors();
      expect(colors['film-plain']).toBeUndefined();
      expect(colors['case-blank']).toBeUndefined();
    });

    it('is idempotent — a second run writes nothing new', async () => {
      const before = await prisma.productAttributeValue.count({
        where: { productId: { in: productIds } },
      });
      for (const statement of migrationStatements()) {
        await prisma.$executeRawUnsafe(statement);
      }
      expect(
        await prisma.productAttributeValue.count({ where: { productId: { in: productIds } } }),
      ).toBe(before);
    });
  });

  describe('after the backfill — the bridge works end to end', () => {
    it('finds a product through ?specs=color:<value>', async () => {
      // The whole task, in one assertion: a colour that existed ONLY in the
      // variant-axis JSON is now a working catalogue filter.
      expect(await listNames({ specFilters: parseSpecFilters('color:Чорний') })).toEqual([
        'case-black',
        'root-black',
      ]);
    });

    it('matches the import spelling `color` and the seed spelling «Колір» alike', async () => {
      expect(await listNames({ specFilters: parseSpecFilters('color:Синій,Білий') })).toEqual([
        'case-import-blue',
        'case-white',
      ]);
    });

    it('offers colour in filterable-specs, ahead of the older facet', async () => {
      const facets = await facetService.getFilterableSpecs(rootId);
      expect(facets.map((facet) => facet.definition.key)).toEqual(['color', 'material']);
      expect(facets[0].values).toEqual(['Білий', 'Синій', 'Чорний']);
    });

    it('offers colour in the CHILD category too — definitions inherit downward', async () => {
      const facets = await facetService.getFilterableSpecs(leafId);
      expect(facets.map((facet) => facet.definition.key)).toContain('color');
    });

    it('does NOT offer an empty colour facet in a subcategory with no colours', async () => {
      // The inherited definition reaches this leaf, but nothing in it is
      // coloured. Surfacing the facet would render a filter a shopper can open
      // and find nothing in — the case plan 182 calls out explicitly.
      const facets = await facetService.getFilterableSpecs(colourlessLeafId);
      expect(facets.map((facet) => facet.definition.key)).toEqual(['material']);
    });

    it('composes with another facet: colour AND material intersect', async () => {
      expect(
        await listNames({ specFilters: parseSpecFilters('color:Чорний;material:Силікон') }),
      ).toEqual(['case-black']);
    });
  });

  describe('the admin bulk colour write keeps BOTH sides in step', () => {
    it('writes the axis JSON and the spec value together', async () => {
      const target = await prisma.product.findFirstOrThrow({
        where: { name: 'film-plain', id: { in: productIds } },
      });

      const definition = await definitionRepo.ensureColorDefinitionForCategory(target.categoryId);
      const { updated } = await productRepo.setColorMany(
        [target.id],
        'Зелений',
        new Map([[target.id, definition.id]]),
      );
      expect(updated).toHaveLength(1);

      const after = await prisma.product.findUniqueOrThrow({ where: { id: target.id } });
      // The axis half — what paints the swatch on the card and drives the PDP
      // variant navigator.
      expect(after.attributes).toEqual({ Колір: 'Зелений' });
      // The spec half — what the catalogue filter reads. Either alone is the
      // drift TASK-487 exists to end.
      expect((await storedColors())['film-plain']).toBe('Зелений');
    });

    it('makes the recoloured product findable by the facet immediately', async () => {
      expect(await listNames({ specFilters: parseSpecFilters('color:Зелений') })).toEqual([
        'film-plain',
      ]);
    });

    it("adopts the GROUP's axis spelling for a position that had no colour", async () => {
      const target = await prisma.product.findFirstOrThrow({
        where: { name: 'case-blank', id: { in: productIds } },
      });
      await prisma.product.update({ where: { id: target.id }, data: { groupId } });

      const definition = await definitionRepo.ensureColorDefinitionForCategory(target.categoryId);
      await productRepo.setColorMany([target.id], 'Рожевий', new Map([[target.id, definition.id]]));

      const after = await prisma.product.findUniqueOrThrow({ where: { id: target.id } });
      expect(after.attributes).toEqual({ Колір: 'Рожевий' });
    });

    it('returns the SIBLINGS so their cached detail can be evicted', async () => {
      const black = await prisma.product.findFirstOrThrow({
        where: { name: 'case-black', id: { in: productIds } },
      });
      const definition = await definitionRepo.ensureColorDefinitionForCategory(black.categoryId);

      const { siblings } = await productRepo.setColorMany(
        [black.id],
        'Синій титан',
        new Map([[black.id, definition.id]]),
      );

      // A cached product detail carries its variantSiblings and their
      // attributes, so recolouring one position changes what the others say.
      expect(siblings.map((sibling) => sibling.slug).sort()).toEqual(
        [`case-white-${suffix}`, `case-blank-${suffix}`].sort(),
      );
    });

    it('clears BOTH sides when the colour is set to null', async () => {
      const target = await prisma.product.findFirstOrThrow({
        where: { name: 'case-import-blue', id: { in: productIds } },
      });

      await productRepo.setColorMany([target.id], null, new Map());

      const after = await prisma.product.findUniqueOrThrow({ where: { id: target.id } });
      // The non-colour axis survives; the colour one is gone.
      expect(after.attributes).toEqual({ Розмір: 'L' });
      expect((await storedColors())['case-import-blue']).toBeUndefined();
      expect(await listNames({ specFilters: parseSpecFilters('color:Синій') })).toEqual([]);
    });

    it('rolls the whole batch back when an id is unknown', async () => {
      const known = await prisma.product.findFirstOrThrow({
        where: { name: 'case-white', id: { in: productIds } },
      });
      const before = await prisma.product.findUniqueOrThrow({ where: { id: known.id } });

      await expect(
        productRepo.setColorMany([known.id, randomUUID()], 'Золотий', new Map()),
      ).rejects.toThrow(/Unknown product id/);

      const after = await prisma.product.findUniqueOrThrow({ where: { id: known.id } });
      expect(after.attributes).toEqual(before.attributes);
    });
  });
});
