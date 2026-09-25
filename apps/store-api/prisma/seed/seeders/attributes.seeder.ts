import { PrismaClient } from '@prisma/client';
import { COLOR_SPEC_KEY } from '../../../src/common/color-axis';
import {
  colorOptionsByRoot,
  definitionsByRootCategory,
  inertFacets,
  specsOfPosition,
} from '../data/attributes.data';
import { cataloguePositions } from '../data/catalogue';
import { rootCategorySlug } from '../data/categories.data';

/**
 * Structured-spec templates and their values (TASK-191), driven entirely by
 * `data/attributes.data.ts` — the previous revision hardcoded the
 * `smartphones` / `iphone` pair and read `attrs.storage`, which stopped
 * existing when the axes became Ukrainian (TASK-366).
 *
 * Definitions live on the ROOT category and are inherited down the subtree at
 * read time, so declaring «Матеріал» once on «Чохли» covers all three case
 * subcategories. Values come from two places: the entry's own `specs`, and the
 * position's variant axis for the specs listed in {@link AXIS_BACKED_SPECS} —
 * otherwise every position of an iPhone group would report the same storage.
 *
 * Since TASK-487 COLOUR is bridged the same way, but matched through the shared
 * `src/common/color-axis.ts` vocabulary instead of one literal axis name. That
 * bridge is the whole point of the task: colour used to live ONLY in the
 * free-form `attributes` JSON, which no facet query reads.
 *
 * Idempotent: definitions upsert on the `(categoryId, key)` unique; values are
 * deleted and recreated wholesale for the seeded positions, which also drops
 * rows whose spec was removed from the data.
 */
export async function seedAttributeDefinitions(
  prisma: PrismaClient,
  categories: Record<string, { id: string }>,
) {
  // ── Definitions ──
  const definitionIds = new Map<string, string>();
  const definitionTypes = new Map<string, string>();
  let definitionCount = 0;

  // Colour options are DERIVED from the catalogue rather than declared
  // (TASK-487) — see `optionsFromColorAxis` in `attributes.data.ts`.
  const colorOptions = colorOptionsByRoot();
  // Declared facets whose every product answers the same (TASK-700): written
  // unflagged on BOTH upsert branches, so a re-seed clears a stale flag too.
  const inert = inertFacets();

  for (const [rootSlug, definitions] of Object.entries(definitionsByRootCategory)) {
    const category = categories[rootSlug];
    if (!category) {
      throw new Error(`Seed: attribute definitions declared on unknown category "${rootSlug}"`);
    }
    for (let i = 0; i < definitions.length; i++) {
      const d = definitions[i];
      let options = d.options;
      if (d.optionsFromColorAxis) {
        options = colorOptions.get(rootSlug);
        // A SELECT with no options is a dropdown an operator cannot use, and a
        // facet a shopper can open and find empty. If the declaration and the
        // catalogue have drifted apart, say so here rather than seeding one.
        if (!options || options.length === 0) {
          throw new Error(
            `Seed: root category "${rootSlug}" declares the colour facet, but no position in ` +
              `data/catalogue/** carries a colour axis. Remove COLOR_DEFINITION from that root ` +
              `or give its positions colours.`,
          );
        }
      }
      const data = {
        label: d.label,
        type: d.type,
        unit: d.unit ?? null,
        options: options ?? undefined,
        isFilterable: (d.isFilterable ?? false) && !inert.has(`${rootSlug}:${d.key}`),
        sortOrder: i,
      };
      const record = await prisma.attributeDefinition.upsert({
        where: { categoryId_key: { categoryId: category.id, key: d.key } },
        update: data,
        create: { categoryId: category.id, key: d.key, ...data },
      });
      definitionIds.set(`${rootSlug}:${d.key}`, record.id);
      definitionTypes.set(`${rootSlug}:${d.key}`, d.type);
      definitionCount++;
    }
  }

  // ── Values ──
  const positions = cataloguePositions();
  const productIdBySlug = new Map(
    (
      await prisma.product.findMany({
        where: { slug: { in: positions.map((p) => p.slug) } },
        select: { id: true, slug: true },
      })
    ).map((p) => [p.slug, p.id]),
  );

  const rows: {
    productId: string;
    definitionId: string;
    value: string;
    valueNumber: number | null;
  }[] = [];

  for (const position of positions) {
    const productId = productIdBySlug.get(position.slug);
    if (!productId) continue;

    const rootSlug = rootCategorySlug(position.entry.categorySlug);
    // Entry specs, overridden by the axis-backed ones, plus the colour bridge
    // (TASK-487) — `specsOfPosition` is the one derivation, shared with
    // `inertFacets` so the facet rule judges exactly what is written here.
    //
    // Colour is matched by the shared colour vocabulary rather than one literal
    // axis name (`color` / `colour` / «Колір» all occur in this repo); writing it
    // is what makes `?specs=color:Чорний` and `filterable-specs` able to SEE a
    // colour at all. No `if (root declares color)` guard on purpose — the loop
    // below throws on a spec the root does not declare, and for colour that
    // throw is the point: a coloured position in an undeclared root is a
    // catalogue that quietly lost its strongest facet.
    const specs = specsOfPosition(position);

    for (const [key, raw] of Object.entries(specs)) {
      const definitionId = definitionIds.get(`${rootSlug}:${key}`);
      if (!definitionId) {
        throw new Error(
          `Seed: entry "${position.entry.slug}" sets spec "${key}", which is not declared on root category "${rootSlug}"`,
        );
      }
      // BOOLEAN specs are stored as the literal 'true' / 'false' — that is what
      // `format-spec.ts` compares against to render «Так» / «Ні».
      const value = String(raw);
      const isNumber = definitionTypes.get(`${rootSlug}:${key}`) === 'NUMBER';
      rows.push({
        productId,
        definitionId,
        value,
        valueNumber: isNumber && Number.isFinite(Number(value)) ? Number(value) : null,
      });
    }
  }

  await prisma.productAttributeValue.deleteMany({
    where: { productId: { in: [...productIdBySlug.values()] } },
  });
  await prisma.productAttributeValue.createMany({ data: rows });

  const withThreePlus = new Set<string>();
  const perProduct = new Map<string, number>();
  for (const row of rows) {
    const next = (perProduct.get(row.productId) ?? 0) + 1;
    perProduct.set(row.productId, next);
    if (next >= 3) withThreePlus.add(row.productId);
  }

  // Colour is reported separately because it is the one spec the seed DERIVES
  // rather than reads (TASK-487): a zero here means the bridge silently stopped
  // matching the axis, and every colour swatch in the catalogue is gone.
  const colorDefinitionIds = new Set(
    [...definitionIds.entries()]
      .filter(([composite]) => composite.endsWith(`:${COLOR_SPEC_KEY}`))
      .map(([, id]) => id),
  );
  const colorRows = rows.filter((row) => colorDefinitionIds.has(row.definitionId)).length;

  console.log(
    `  ✓ Attribute definitions: ${definitionCount} across ${Object.keys(definitionsByRootCategory).length} root categories, ` +
      `${rows.length} values (${withThreePlus.size} positions with 3+ specs, ${colorRows} colour facet values)`,
  );
  if (inert.size > 0) {
    console.log(
      `  ✓ Facets hidden because every product has the same value: ${[...inert].sort().join(', ')}`,
    );
  }
}
