import { PrismaClient } from '@prisma/client';
import { buildProductsData } from '../data/catalogue';
import { deterministicUuid } from '../lib/ids';
import { pickIcon } from '../lib/images/icon-set';
import { pickPalette } from '../lib/images/palettes';
import { renderSeedImages } from '../lib/images/seed-image.generator';
import { positionSlugsOf } from '../lib/position-slug';
import { assertLatinSlug, assertUniqueSlugs } from '../lib/slug';

export async function seedProducts(
  prisma: PrismaClient,
  categories: Record<string, { id: string }>,
  brands: Record<string, { id: string }>,
) {
  const productsData = buildProductsData(categories);
  const categorySlugById = new Map(Object.entries(categories).map(([slug, c]) => [c.id, slug]));

  // Pre-flight guards (plan 170). Every slug that reaches the DB must be a latin
  // kebab-case token; position slugs and SKUs must both be unique across the
  // whole catalogue, because `slug` and `sku` are UNIQUE columns and a collision
  // would otherwise surface as an opaque Prisma error mid-write. All of this
  // runs BEFORE the first insert, so a bad entry fails the seed, not the DB.
  const allPositionSlugs: string[] = [];
  const allSkus: string[] = [];
  for (const p of productsData) {
    assertLatinSlug(p.slug, `product entry "${p.name}"`);
    for (const positionSlug of positionSlugsOf(p)) {
      assertLatinSlug(positionSlug, `product position of "${p.name}"`);
      allPositionSlugs.push(positionSlug);
    }
    for (const variant of p.variants) {
      allSkus.push(variant.sku ?? p.sku);
    }
    if (p.brandSlug && !brands[p.brandSlug]) {
      throw new Error(`Seed: entry "${p.slug}" names unknown brand "${p.brandSlug}"`);
    }
  }
  assertUniqueSlugs(allPositionSlugs, 'product positions');
  assertUniqueSlugs(allSkus, 'product SKUs');

  let groupCount = 0;
  let positionCount = 0;
  let imageCount = 0;

  for (const p of productsData) {
    // A catalog entry with more than one variant becomes a ProductGroup whose
    // members are first-class Product positions; a single-variant entry is a
    // standalone position with no group (TASK-142).
    const isGroup = p.variants.length > 1;

    let groupId: string | null = null;
    if (isGroup) {
      // Bound to a `const` so the narrowed `string` survives into the closure
      // below — the old `groupId!` assertion was there for exactly this reason.
      const id = deterministicUuid(p.slug);
      groupId = id;

      // Axis names are the distinct attribute keys across the variants, in
      // first-seen order. They are UKRAINIAN («Колір», «Пам'ять»): the axis name
      // is rendered raw by `product-sibling-navigator.tsx`, so it has to read as
      // a label. Attribute-definition KEYS stay latin for the opposite reason —
      // see `data/attributes.data.ts`.
      const axisNames: string[] = [];
      for (const v of p.variants) {
        for (const key of Object.keys(v.attributes ?? {})) {
          if (!axisNames.includes(key)) axisNames.push(key);
        }
      }

      await prisma.productGroup.upsert({
        where: { id },
        update: { name: p.name, isActive: true },
        create: { id, name: p.name, isActive: true },
      });

      // Replace axes wholesale so re-seeding stays idempotent.
      await prisma.productGroupAxis.deleteMany({ where: { groupId: id } });
      if (axisNames.length > 0) {
        await prisma.productGroupAxis.createMany({
          data: axisNames.map((name, index) => ({ groupId: id, name, sortOrder: index })),
        });
      }
      groupCount++;
    }

    const brandId = p.brandSlug ? (brands[p.brandSlug]?.id ?? null) : null;

    const positionSlugs = positionSlugsOf(p);

    // Create one position per variant. Group members carry the variant name and
    // attributes; a standalone position takes the entry name and empty attributes.
    for (let i = 0; i < p.variants.length; i++) {
      const v = p.variants[i];
      const positionSlug = positionSlugs[i];
      const positionName = isGroup ? `${p.name} — ${v.name}` : p.name;
      const positionSku = v.sku ?? p.sku;
      const attributes = isGroup ? (v.attributes ?? {}) : {};

      const positionData = {
        name: positionName,
        slug: positionSlug,
        description: p.description,
        price: v.price,
        compareAtPrice: p.compareAtPrice ?? null,
        sku: positionSku,
        stock: v.stock,
        categoryId: p.categoryId,
        groupId,
        brandId,
        metaTitle: p.metaTitle ?? null,
        metaDescription: p.metaDescription ?? null,
        attributes,
        positionOrder: i,
        isActive: true,
      };

      const position = await prisma.product.upsert({
        where: { slug: positionSlug },
        update: positionData,
        create: positionData,
      });
      positionCount++;

      // Clone the entry's images onto each position (shared gallery). Delete
      // existing first for idempotency. The URLs / bytes come from the seed-image
      // seam, which today reproduces the deterministic picsum.photos URLs keyed
      // on the position slug; TASK-365 swaps the stub for locally generated WebP
      // without touching this call. The first image is the primary (cover).
      await prisma.productImage.deleteMany({ where: { productId: position.id } });
      const iconId = pickIcon(categorySlugById.get(p.categoryId) ?? '', p.slug);
      const paletteId = pickPalette(positionSlug);
      const imageRefs = await renderSeedImages(
        p.images.map((img) => ({
          key: positionSlug,
          iconId,
          paletteId,
          shape: 'product' as const,
          sortOrder: img.sortOrder,
          alt: img.alt,
        })),
      );
      for (const ref of imageRefs) {
        await prisma.productImage.create({
          data: {
            productId: position.id,
            url: ref.url,
            alt: ref.alt,
            blurDataUrl: ref.blurDataUrl,
            sortOrder: ref.sortOrder,
            isPrimary: ref.isPrimary,
          },
        });
        imageCount++;
      }
    }
  }

  console.log(
    `  ✓ Products: ${groupCount} groups, ${positionCount} positions, ${imageCount} images`,
  );
}
