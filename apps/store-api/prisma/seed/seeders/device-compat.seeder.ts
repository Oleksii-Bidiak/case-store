import { PrismaClient } from '@prisma/client';
import { catalogueEntries, positionSlugsOfEntry } from '../data/catalogue';
import { compatPlan } from '../data/compat.data';

/**
 * Seed Product ↔ DeviceModel compatibility links (TASK-190) so the storefront
 * compat picker and the PDP «підходить до вашого пристрою» surface have real
 * data.
 *
 * Resolution is exact and every miss is fatal. The previous revision matched
 * positions by slug **prefix** and skipped unresolved device slugs with a bare
 * `continue`, so when TASK-366 replaced the assortment it printed «0 links» and
 * exited 0 — the seed reported success while a whole storefront feature had
 * quietly lost its data. The prefix match was wrong in the other direction too:
 * `glass-9h-iphone-15` is a strict prefix of `glass-9h-iphone-15-pro`, so the
 * iPhone 15 glass would have claimed the 15 Pro's positions as well.
 *
 * Idempotent — the composite `(productId, deviceModelId)` primary key makes
 * re-linking the same pair a no-op upsert.
 */
export async function seedDeviceCompat(prisma: PrismaClient) {
  // ── Pre-flight: report every mismatch at once, before writing anything ──
  const knownEntrySlugs = new Set(catalogueEntries.map((entry) => entry.slug));
  const unknownEntries = compatPlan
    .map((plan) => plan.entrySlug)
    .filter((slug) => !knownEntrySlugs.has(slug));

  const wantedDeviceSlugs = [...new Set(compatPlan.flatMap((plan) => plan.deviceSlugs))];
  const deviceModels = await prisma.deviceModel.findMany({
    where: { slug: { in: wantedDeviceSlugs } },
    select: { id: true, slug: true },
  });
  const deviceBySlug = new Map(deviceModels.map((model) => [model.slug, model.id]));
  const unknownDevices = wantedDeviceSlugs.filter((slug) => !deviceBySlug.has(slug));

  const problems = [
    unknownEntries.length && `catalogue entries: ${unknownEntries.sort().join(', ')}`,
    unknownDevices.length && `device models: ${unknownDevices.sort().join(', ')}`,
  ].filter(Boolean);

  if (problems.length) {
    throw new Error(
      `seedDeviceCompat: compat.data.ts references things that do not exist — ${problems.join('; ')}. ` +
        'Entry slugs come from data/catalogue/**; device slugs are slugify(model.name) from data/devices.data.ts.',
    );
  }

  // ── Link every position of every planned entry ──
  const plannedPositionSlugs = compatPlan.flatMap((plan) => positionSlugsOfEntry(plan.entrySlug));
  const productIdBySlug = new Map(
    (
      await prisma.product.findMany({
        where: { slug: { in: plannedPositionSlugs } },
        select: { id: true, slug: true },
      })
    ).map((product) => [product.slug, product.id]),
  );

  let linkCount = 0;
  for (const plan of compatPlan) {
    for (const positionSlug of positionSlugsOfEntry(plan.entrySlug)) {
      const productId = productIdBySlug.get(positionSlug);
      if (!productId) {
        throw new Error(
          `seedDeviceCompat: position "${positionSlug}" of entry "${plan.entrySlug}" is missing from the ` +
            'database — seedProducts must run before this seeder.',
        );
      }
      for (const deviceSlug of plan.deviceSlugs) {
        const deviceModelId = deviceBySlug.get(deviceSlug)!;
        await prisma.productDeviceCompat.upsert({
          where: { productId_deviceModelId: { productId, deviceModelId } },
          update: {},
          create: { productId, deviceModelId },
        });
        linkCount++;
      }
    }
  }

  console.log(
    `  ✓ Device compat: ${linkCount} product ↔ device links across ${compatPlan.length} entries`,
  );
}
