import type { PrismaClient } from '@prisma/client';
import { COLOR_SPEC_KEY } from '../../../src/common/color-axis';
import { cataloguePositions } from '../data/catalogue';
import { categoryTree } from '../data/categories.data';
import { definitionsByRootCategory } from '../data/attributes.data';
import { seedAttributeDefinitions } from './attributes.seeder';

/**
 * The seeder's axis → spec bridge, run for real against a fake Prisma
 * (TASK-487).
 *
 * The seed is the one place where the whole catalogue passes through this code
 * at once, and its failure mode is silent: a coloured position whose root does
 * not declare the colour facet produces a catalogue that looks complete and has
 * no colour filter. The seeder throws on that — and this test is what proves the
 * throw is not what happens for the REAL data, 178 positions of it, rather than
 * for a two-row fixture.
 *
 * Prisma is faked rather than mocked module-wide: every call the seeder makes is
 * a write whose ARGUMENTS are the thing worth asserting, and recording them is
 * simpler than any spy framework would make it.
 */
type UpsertArgs = {
  where: { categoryId_key: { categoryId: string; key: string } };
  update: Record<string, unknown>;
  create: Record<string, unknown>;
};

type ValueRow = { productId: string; definitionId: string; value: string };

function fakePrisma(productIdBySlug: Map<string, string>) {
  const upserts: UpsertArgs[] = [];
  const created: ValueRow[] = [];

  const prisma = {
    attributeDefinition: {
      upsert: (args: UpsertArgs) => {
        upserts.push(args);
        const { categoryId, key } = args.where.categoryId_key;
        return Promise.resolve({ id: `def:${categoryId}:${key}` });
      },
    },
    product: {
      findMany: ({ where }: { where: { slug: { in: string[] } } }) =>
        Promise.resolve(
          where.slug.in
            .filter((slug) => productIdBySlug.has(slug))
            .map((slug) => ({ id: productIdBySlug.get(slug), slug })),
        ),
    },
    productAttributeValue: {
      deleteMany: () => Promise.resolve({ count: 0 }),
      createMany: ({ data }: { data: ValueRow[] }) => {
        created.push(...data);
        return Promise.resolve({ count: data.length });
      },
    },
  } as unknown as PrismaClient;

  return { prisma, upserts, created };
}

/** Every category slug in the tree mapped to a synthetic id, as the seed does. */
function allCategories(): Record<string, { id: string }> {
  const map: Record<string, { id: string }> = {};
  for (const root of categoryTree) {
    map[root.slug] = { id: `cat:${root.slug}` };
    for (const child of root.children ?? []) {
      map[child.slug] = { id: `cat:${child.slug}` };
    }
  }
  return map;
}

describe('seedAttributeDefinitions — the colour bridge (TASK-487)', () => {
  const positions = cataloguePositions();
  const productIdBySlug = new Map(positions.map((p, i) => [p.slug, `prod-${i}`]));

  let upserts: UpsertArgs[];
  let created: ValueRow[];
  let logSpy: jest.SpyInstance;

  beforeAll(async () => {
    logSpy = jest.spyOn(console, 'log').mockImplementation(() => undefined);
    const fake = fakePrisma(productIdBySlug);
    await seedAttributeDefinitions(fake.prisma, allCategories());
    upserts = fake.upserts;
    created = fake.created;
  });

  afterAll(() => logSpy.mockRestore());

  it('runs the WHOLE catalogue through without an undeclared-spec throw', () => {
    // If a coloured position ever lands in a root that does not declare the
    // colour facet, `seedAttributeDefinitions` throws — and the assertion above
    // (it got here at all) is the one that catches it.
    expect(created.length).toBeGreaterThan(0);
  });

  it('declares a filterable SELECT colour definition in every colour root', () => {
    const colourUpserts = upserts.filter(
      (args) => args.where.categoryId_key.key === COLOR_SPEC_KEY,
    );

    expect(colourUpserts.length).toBe(
      Object.values(definitionsByRootCategory).filter((defs) =>
        defs.some((def) => def.key === COLOR_SPEC_KEY),
      ).length,
    );
    for (const args of colourUpserts) {
      expect(args.create).toMatchObject({
        key: COLOR_SPEC_KEY,
        label: 'Колір',
        type: 'SELECT',
        isFilterable: true,
        sortOrder: 0,
      });
      // Derived from the catalogue, never empty — an empty option list is a
      // dropdown an operator cannot use and a facet with nothing in it.
      expect((args.create.options as string[]).length).toBeGreaterThan(0);
    }
  });

  it('writes a colour spec value for EVERY position that has a colour axis', () => {
    const colouredPositions = positions.filter(
      (position) => position.variant.attributes?.['Колір'] !== undefined,
    );
    const colourRows = created.filter((row) => row.definitionId.endsWith(`:${COLOR_SPEC_KEY}`));

    // The count is the assertion that matters: this is the number that was ZERO
    // before TASK-487, with the colours sitting in `attributes` JSON the whole
    // time.
    expect(colourRows).toHaveLength(colouredPositions.length);
    expect(colourRows.length).toBeGreaterThan(50);
  });

  it('files each colour against its ROOT category definition', () => {
    // Definitions live on the root and are inherited downward; a value written
    // against a leaf's id would be a definition that does not exist.
    for (const row of created.filter((r) => r.definitionId.endsWith(`:${COLOR_SPEC_KEY}`))) {
      const root = row.definitionId.slice('def:cat:'.length, -`:${COLOR_SPEC_KEY}`.length);
      expect(Object.keys(definitionsByRootCategory)).toContain(root);
    }
  });

  it('writes the POSITION own colour, not one value for the whole entry', () => {
    // The point of an axis-backed spec: sibling positions of one group differ.
    const byProduct = new Map(created.map((row) => [row.productId, row]));
    const black = positions.find((position) => position.variant.attributes?.['Колір'] === 'Чорний');
    const white = positions.find((position) => position.variant.attributes?.['Колір'] === 'Білий');
    expect(black).toBeDefined();
    expect(white).toBeDefined();

    const colourOf = (slug: string) =>
      created.find(
        (row) =>
          row.productId === productIdBySlug.get(slug) &&
          row.definitionId.endsWith(`:${COLOR_SPEC_KEY}`),
      )?.value;

    expect(colourOf(black!.slug)).toBe('Чорний');
    expect(colourOf(white!.slug)).toBe('Білий');
    expect(byProduct.size).toBeGreaterThan(0);
  });

  it('leaves the colourless roots without a colour definition', () => {
    for (const root of ['cables', 'screen-protectors', 'memory-cards']) {
      expect(
        upserts.some(
          (args) =>
            args.where.categoryId_key.categoryId === `cat:${root}` &&
            args.where.categoryId_key.key === COLOR_SPEC_KEY,
        ),
      ).toBe(false);
    }
  });

  it('still writes the OTHER axis-backed specs it always did', () => {
    // Guard against the colour branch having quietly displaced «Пам'ять».
    const memory = created.filter((row) => row.definitionId.endsWith(':memory'));
    expect(memory.length).toBeGreaterThan(0);
  });
});
