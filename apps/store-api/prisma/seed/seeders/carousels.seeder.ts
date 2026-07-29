import { PrismaClient } from '@prisma/client';
import { buildCarousels } from '../data/content/carousels.data';
import { deterministicUuid } from '../lib/ids';

/**
 * Seed the published homepage carousels (TASK-139, TASK-288). Two placements:
 *
 *   HOME_TABS  — the three tabs of the "Популярне" section, reproducing the
 *                storefront's former hardcoded tabs 1:1 (titles copied from
 *                `store-client/src/shared/config/dictionary.ts` → `home.popular.tabs`,
 *                itemLimit 12 = the rail size the hardcoded fetch used). Tab
 *                order = `sortOrder` (0/1/2).
 *   HOME_RAILS — standalone rails below: a CATEGORY rule pointed at a seeded
 *                parent category (exercises the subtree rollup) and a MANUAL
 *                carousel with hand-picked products.
 *
 * `sortOrder` is scoped to the placement, so both buckets start at 0. The
 * BESTSELLING carousel is a TAB, not a rail — an identical "Хіти продажів" rail
 * underneath the tab it duplicates would just be broken-looking demo data.
 *
 * Idempotent via deterministic ids; MANUAL items are replaced wholesale on
 * re-run. The storefront renders correctly with ZERO carousels, so this is a
 * convenience, not a requirement. Must run AFTER seedCategories/seedProducts.
 */
export async function seedCarousels(prisma: PrismaClient) {
  const casesCategory = await prisma.category.findUnique({ where: { slug: 'cases' } });

  const now = new Date();

  const carousels = buildCarousels(casesCategory);

  for (const c of carousels) {
    const id = deterministicUuid(`carousel:${c.slug}`);
    const data = {
      title: c.title,
      source: c.source,
      placement: c.placement,
      categoryId: c.categoryId ?? null,
      itemLimit: c.itemLimit ?? 12,
      sortOrder: c.sortOrder,
      status: 'PUBLISHED' as const,
      publishedAt: now,
      scheduledAt: null,
    };

    await prisma.carousel.upsert({
      where: { id },
      update: data,
      create: { id, ...data },
    });
  }

  // Hand-pick a few active seeded products for the MANUAL carousel. Full-replace
  // keeps re-runs idempotent (mirrors the admin endpoint's write shape).
  const manualId = deterministicUuid('carousel:editors-pick');
  const picks = await prisma.product.findMany({
    where: { isActive: true, deletedAt: null },
    orderBy: { createdAt: 'asc' },
    take: 4,
    select: { id: true },
  });

  await prisma.$transaction([
    prisma.carouselItem.deleteMany({ where: { carouselId: manualId } }),
    ...(picks.length > 0
      ? [
          prisma.carouselItem.createMany({
            data: picks.map((p, index) => ({
              carouselId: manualId,
              productId: p.id,
              sortOrder: index,
            })),
          }),
        ]
      : []),
  ]);

  const tabCount = carousels.filter((c) => c.placement === 'HOME_TABS').length;
  console.log(
    `  ✓ Carousels: ${carousels.length} published (${tabCount} HOME_TABS, ${carousels.length - tabCount} HOME_RAILS, ${picks.length} manual items)`,
  );
}
