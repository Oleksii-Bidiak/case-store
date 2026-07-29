import { PrismaClient } from '@prisma/client';
import { buildSubcategories, categoriesData } from '../data/categories.data';
import { pickIcon } from '../lib/images/icon-set';
import { pickPalette } from '../lib/images/palettes';
import { renderCategoryTile } from '../lib/images/seed-image.generator';
import { assertLatinSlug, assertUniqueSlugs } from '../lib/slug';

interface CategoryInput {
  name: string;
  slug: string;
  description: string;
  metaTitle: string | null;
  metaDescription: string | null;
  sortOrder: number;
  parentId?: string;
}

/**
 * Seed the catalogue taxonomy: 11 Ukrainian roots + their subcategories
 * (TASK-366). Idempotent — upsert on the unique `slug`, and unlike the previous
 * revision the `update` branch actually writes the fields, so renaming a
 * category in `categories.data.ts` reaches an existing dev database instead of
 * silently doing nothing.
 *
 * `Category.image` is filled from the seed-image seam (TASK-365). The stub
 * returns `null` until that branch lands, which leaves the column untouched and
 * the storefront on its icon fallback — the intended intermediate state.
 */
export async function seedCategories(prisma: PrismaClient) {
  const categories: Record<string, { id: string }> = {};
  let tileCount = 0;

  const upsertCategory = async (cat: CategoryInput) => {
    const image = await renderCategoryTile({
      key: `category-${cat.slug}`,
      iconId: pickIcon(cat.slug, cat.slug),
      paletteId: pickPalette(cat.slug),
      shape: 'category',
      sortOrder: 0,
      alt: cat.name,
    });
    if (image) tileCount++;

    const data = {
      name: cat.name,
      description: cat.description,
      metaTitle: cat.metaTitle,
      metaDescription: cat.metaDescription,
      sortOrder: cat.sortOrder,
      parentId: cat.parentId ?? null,
      isActive: true,
      // Never clear a tile the renderer did not produce — on the stub branch
      // `image` is null and an existing value (or the admin's own upload) stays.
      ...(image ? { image } : {}),
    };

    categories[cat.slug] = await prisma.category.upsert({
      where: { slug: cat.slug },
      update: data,
      create: { slug: cat.slug, ...data },
    });
  };

  // Roots first — subcategories need their real `parentId`.
  for (const cat of categoriesData) assertLatinSlug(cat.slug, `category "${cat.name}"`);
  for (const cat of categoriesData) await upsertCategory(cat);

  const allSubcategories = buildSubcategories(categories);
  for (const sub of allSubcategories) assertLatinSlug(sub.slug, `category "${sub.name}"`);
  assertUniqueSlugs(
    [...categoriesData.map((c) => c.slug), ...allSubcategories.map((s) => s.slug)],
    'categories',
  );
  for (const sub of allSubcategories) await upsertCategory(sub);

  console.log(
    `  ✓ Categories: ${Object.keys(categories).length} upserted ` +
      `(${categoriesData.length} roots, ${allSubcategories.length} subcategories, ${tileCount} tiles)`,
  );
  return categories;
}
