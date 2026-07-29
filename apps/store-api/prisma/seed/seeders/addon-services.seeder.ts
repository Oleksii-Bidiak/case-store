import { PrismaClient } from '@prisma/client';
import { deltas, servicesData, templateServiceNames } from '../data/addons.data';

/**
 * Add-on services / protection plans (TASK-174).
 *
 * Seeds the catalog plus a worked example of the whole applicability model, so
 * inheritance can be exercised in dev/QA without any manual admin entry:
 *   - a CategoryAddonTemplate on the PARENT `smartphones` category — every
 *     product in its `iphone` subcategory (which has no template of its own)
 *     inherits it via nearest-ancestor-wins;
 *   - one delta of EACH type on three distinct iPhone products — an exclusive
 *     ADD, a REMOVE opt-out, and a price OVERRIDE.
 */
export async function seedAddonServices(
  prisma: PrismaClient,
  categories: Record<string, { id: string }>,
) {
  // `AddonService.name` is not unique in the schema (an admin may legitimately
  // reuse a name), so the seed is made idempotent by name lookup rather than by
  // `upsert` — re-running it updates the existing row instead of duplicating it.
  const services: Record<string, { id: string }> = {};
  for (const s of servicesData) {
    const existing = await prisma.addonService.findFirst({ where: { name: s.name } });
    const record = existing
      ? await prisma.addonService.update({ where: { id: existing.id }, data: s })
      : await prisma.addonService.create({ data: s });
    services[s.name] = record;
  }

  console.log(`  ✓ AddonServices: ${servicesData.length} services`);

  // Template on the PARENT category — the `iphone` subcategory inherits it.
  for (const name of templateServiceNames) {
    await prisma.categoryAddonTemplate.upsert({
      where: {
        categoryId_addonServiceId: {
          categoryId: categories['smartphones'].id,
          addonServiceId: services[name].id,
        },
      },
      update: {},
      create: {
        categoryId: categories['smartphones'].id,
        addonServiceId: services[name].id,
      },
    });
  }

  console.log(
    `  ✓ CategoryAddonTemplate: ${templateServiceNames.length} services on «Смартфони» (inherited by «iPhone»)`,
  );

  // One delta of each type, on three distinct iPhone products.
  const iphoneProducts = await prisma.product.findMany({
    where: { category: { slug: 'iphone' } },
    orderBy: { createdAt: 'asc' },
    take: 3,
    select: { id: true, name: true },
  });

  for (let i = 0; i < Math.min(deltas.length, iphoneProducts.length); i++) {
    const d = deltas[i];
    await prisma.addonServiceDelta.upsert({
      where: {
        productId_addonServiceId: {
          productId: iphoneProducts[i].id,
          addonServiceId: services[d.serviceName].id,
        },
      },
      update: { type: d.type, price: d.price ?? null },
      create: {
        productId: iphoneProducts[i].id,
        addonServiceId: services[d.serviceName].id,
        type: d.type,
        price: d.price ?? null,
      },
    });
  }

  console.log(
    `  ✓ AddonServiceDelta: ${Math.min(deltas.length, iphoneProducts.length)} deltas (ADD / REMOVE / OVERRIDE)`,
  );
}
