import { PrismaClient } from '@prisma/client';
import { definitionsData, modelSpecs } from '../data/attributes.data';

/**
 * Seed structured-spec templates (TASK-191) on the Смартфони root category and
 * fill their values on the seeded iPhone products. Definitions are inherited
 * down the subtree at read time (iPhone → its ancestor Смартфони), so declaring
 * them once on the root covers every phone subcategory. Idempotent — definitions
 * upsert on the `(categoryId, key)` unique; values on `(productId, definitionId)`.
 */
export async function seedAttributeDefinitions(
  prisma: PrismaClient,
  categories: Record<string, { id: string }>,
) {
  const smartphonesCategoryId = categories['smartphones'].id;

  const definitionIds: Record<string, string> = {};
  for (let i = 0; i < definitionsData.length; i++) {
    const d = definitionsData[i];
    const record = await prisma.attributeDefinition.upsert({
      where: { categoryId_key: { categoryId: smartphonesCategoryId, key: d.key } },
      update: {
        label: d.label,
        type: d.type,
        unit: d.unit ?? null,
        options: d.options ?? undefined,
        isFilterable: d.isFilterable,
        sortOrder: i,
      },
      create: {
        categoryId: smartphonesCategoryId,
        key: d.key,
        label: d.label,
        type: d.type,
        unit: d.unit ?? null,
        options: d.options ?? undefined,
        isFilterable: d.isFilterable,
        sortOrder: i,
      },
    });
    definitionIds[d.key] = record.id;
  }

  const iphoneProducts = await prisma.product.findMany({
    where: { category: { slug: 'iphone' } },
    select: { id: true, slug: true, attributes: true },
  });

  let valueCount = 0;
  const upsertValue = async (
    productId: string,
    definitionId: string,
    value: string,
    valueNumber: number | null,
  ) => {
    await prisma.productAttributeValue.upsert({
      where: { productId_definitionId: { productId, definitionId } },
      update: { value, valueNumber },
      create: { productId, definitionId, value, valueNumber },
    });
    valueCount++;
  };

  for (const product of iphoneProducts) {
    const specs = modelSpecs(product.slug);
    if (!specs) continue;

    const attrs = (product.attributes ?? {}) as Record<string, unknown>;
    const memory = typeof attrs.storage === 'string' ? attrs.storage : '128 ГБ';

    await upsertValue(product.id, definitionIds['screen'], specs.screen, null);
    await upsertValue(product.id, definitionIds['memory'], memory, null);
    await upsertValue(product.id, definitionIds['camera'], specs.camera, null);
    await upsertValue(product.id, definitionIds['battery'], String(specs.battery), specs.battery);
  }

  console.log(
    `  ✓ Attribute definitions: ${definitionsData.length} on Смартфони, ${valueCount} values on iPhones`,
  );
}
