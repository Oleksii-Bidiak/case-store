import { PrismaClient } from '@prisma/client';
import { buildSubcategories, categoriesData } from '../data/categories.data';
import { assertLatinSlug } from '../lib/slug';

export async function seedCategories(prisma: PrismaClient) {
  for (const cat of categoriesData) assertLatinSlug(cat.slug, `category "${cat.name}"`);

  const categories: Record<string, { id: string }> = {};

  for (const cat of categoriesData) {
    const record = await prisma.category.upsert({
      where: { slug: cat.slug },
      update: {},
      create: cat,
    });
    categories[cat.slug] = record;
  }

  const allSubcategories = buildSubcategories(categories);
  for (const sub of allSubcategories) assertLatinSlug(sub.slug, `category "${sub.name}"`);

  for (const sub of allSubcategories) {
    const record = await prisma.category.upsert({
      where: { slug: sub.slug },
      update: {},
      create: sub,
    });
    categories[sub.slug] = record;
  }

  console.log(`  ✓ Categories: ${Object.keys(categories).length} created`);
  return categories;
}
