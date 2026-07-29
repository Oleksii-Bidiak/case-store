import { PrismaClient } from '@prisma/client';
import { AXIS_BACKED_SPECS, definitionsByRootCategory } from '../data/attributes.data';
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

  for (const [rootSlug, definitions] of Object.entries(definitionsByRootCategory)) {
    const category = categories[rootSlug];
    if (!category) {
      throw new Error(`Seed: attribute definitions declared on unknown category "${rootSlug}"`);
    }
    for (let i = 0; i < definitions.length; i++) {
      const d = definitions[i];
      const data = {
        label: d.label,
        type: d.type,
        unit: d.unit ?? null,
        options: d.options ?? undefined,
        isFilterable: d.isFilterable ?? false,
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
    const specs: Record<string, string | number | boolean> = { ...(position.entry.specs ?? {}) };

    // Axis-backed specs win over the entry-level value: the position's own
    // «Пам'ять» / «Об'єм» / «Довжина» is what the shopper actually buys.
    for (const { axis, key } of AXIS_BACKED_SPECS) {
      const axisValue = position.variant.attributes?.[axis];
      if (axisValue) specs[key] = axisValue;
    }

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

  console.log(
    `  ✓ Attribute definitions: ${definitionCount} across ${Object.keys(definitionsByRootCategory).length} root categories, ` +
      `${rows.length} values (${withThreePlus.size} positions with 3+ specs)`,
  );
}
