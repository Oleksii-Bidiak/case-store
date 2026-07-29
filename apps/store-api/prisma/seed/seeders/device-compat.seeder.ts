import { PrismaClient } from '@prisma/client';
import { compatPlan } from '../data/compat.data';

/**
 * Seed a few Product ↔ DeviceModel compatibility links (TASK-190) so the
 * storefront compat picker and PDP "fits your device" surface have real data.
 * Links accessories (cases / chargers / protectors) to seeded Apple device
 * models. Idempotent — the composite `(productId, deviceModelId)` primary key
 * makes re-assigning the same pair a no-op upsert.
 */
export async function seedDeviceCompat(prisma: PrismaClient) {
  const allDeviceSlugs = Array.from(new Set(compatPlan.flatMap((c) => c.deviceSlugs)));
  const deviceModels = await prisma.deviceModel.findMany({
    where: { slug: { in: allDeviceSlugs } },
    select: { id: true, slug: true },
  });
  const deviceBySlug = new Map(deviceModels.map((m) => [m.slug, m.id]));

  const allProducts = await prisma.product.findMany({ select: { id: true, slug: true } });

  let linkCount = 0;
  for (const plan of compatPlan) {
    const positions = allProducts.filter((p) => p.slug.startsWith(plan.productSlugPrefix));
    for (const position of positions) {
      for (const deviceSlug of plan.deviceSlugs) {
        const deviceModelId = deviceBySlug.get(deviceSlug);
        if (!deviceModelId) continue;
        await prisma.productDeviceCompat.upsert({
          where: {
            productId_deviceModelId: { productId: position.id, deviceModelId },
          },
          update: {},
          create: { productId: position.id, deviceModelId },
        });
        linkCount++;
      }
    }
  }

  console.log(`  ✓ Device compat: ${linkCount} product ↔ device links`);
}
