import { PrismaClient } from '@prisma/client';
import { devices } from '../data/devices.data';
import { slugify } from '../lib/slug';

/**
 * Seed the device-compatibility taxonomy (TASK-190): a representative slice of
 * device brands + models grouped by `series` for the storefront ModelPicker
 * cascade. Idempotent — brands and models upsert on their unique `slug`, safe to
 * re-run. Compat assignment (Product ↔ DeviceModel) is intentionally NOT seeded
 * here — admins tag products via the admin UI / a separate backfill.
 */
export async function seedDevices(prisma: PrismaClient) {
  let brandCount = 0;
  let modelCount = 0;
  for (const { brand, sortOrder, models } of devices) {
    const brandSlug = slugify(brand);
    const brandRecord = await prisma.deviceBrand.upsert({
      where: { slug: brandSlug },
      update: { name: brand, sortOrder, isActive: true },
      create: { name: brand, slug: brandSlug, sortOrder, isActive: true },
    });
    brandCount++;

    for (const model of models) {
      // Expand '+' to ' plus ' before slugifying so e.g. "Galaxy S24+" does not
      // collide with "Galaxy S24" (both would otherwise slug to "galaxy-s24").
      const modelSlug = slugify(model.name.replace(/\+/g, ' plus '));
      await prisma.deviceModel.upsert({
        where: { slug: modelSlug },
        update: {
          name: model.name,
          series: model.series,
          releaseYear: model.releaseYear,
          deviceBrandId: brandRecord.id,
          isActive: true,
        },
        create: {
          name: model.name,
          slug: modelSlug,
          series: model.series,
          releaseYear: model.releaseYear,
          deviceBrandId: brandRecord.id,
          isActive: true,
        },
      });
      modelCount++;
    }
  }

  console.log(`  ✓ Seeded ${brandCount} device brands, ${modelCount} device models`);
}
