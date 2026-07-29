import { PrismaClient } from '@prisma/client';
import { brandsData } from '../data/brands.data';

/**
 * Seed the product-manufacturer brands (TASK-189) shown in the storefront brand
 * strip / catalog filter. Distinct from the compatible-device brands seeded by
 * `seedDevices` (a Spigen case fits an Apple phone — two separate concepts).
 * Idempotent — upsert on the unique `slug`. Returns a slug → { id } map so
 * `seedProducts` can tag positions with their manufacturer.
 */
export async function seedBrands(prisma: PrismaClient) {
  const brands: Record<string, { id: string }> = {};
  for (const b of brandsData) {
    const record = await prisma.brand.upsert({
      where: { slug: b.slug },
      update: { name: b.name, isActive: true },
      create: { name: b.name, slug: b.slug, isActive: true },
    });
    brands[b.slug] = record;
  }

  console.log(`  ✓ Brands: ${brandsData.length} upserted`);
  return brands;
}
