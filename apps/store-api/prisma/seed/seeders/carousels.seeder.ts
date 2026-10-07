import { HomeBlockType, PrismaClient } from '@prisma/client';
import { buildCarousels } from '../data/content/carousels.data';
import { deterministicUuid } from '../lib/ids';

/**
 * The order of the homepage sections as the old hard-coded `page.tsx` had it — the
 * same order the `…_home_blocks` migration backfills (TASK-660). Used only to place
 * blocks this seeder had to CREATE; an existing page is never reshuffled.
 */
const PAGE_RANK: Record<HomeBlockType, number> = {
  HERO: 0,
  TRUST: 1,
  CATEGORY_NAV: 2,
  TABS: 3,
  CAROUSEL: 4,
  PROMO_BANNER: 5,
  RECENTLY_VIEWED: 6,
  NEWSLETTER: 7,
};

/** The singletons every homepage has (the migration creates them; a reset DB may not). */
const SYSTEM_BLOCKS: HomeBlockType[] = [
  'HERO',
  'TRUST',
  'CATEGORY_NAV',
  'PROMO_BANNER',
  'RECENTLY_VIEWED',
  'NEWSLETTER',
];

/**
 * Seed the published homepage carousels (TASK-139) and put them on the homepage
 * (TASK-660):
 *
 *   tabs  — the three tabs of the «Популярне» TABS block, reproducing the
 *           storefront's former hardcoded tabs 1:1 (titles copied from
 *           `store-client/src/shared/config/dictionary.ts` → `home.popular.tabs`,
 *           itemLimit 12 = the rail size the hardcoded fetch used).
 *   rails — standalone CAROUSEL blocks: a CATEGORY rule pointed at a seeded parent
 *           category (exercises the subtree rollup) and a MANUAL carousel with
 *           hand-picked products.
 *
 * A published carousel shows on the homepage ONLY through a block (decision B-9 №3),
 * so the seeder writes the blocks too — otherwise a freshly seeded shop would show
 * five published carousels nowhere. The BESTSELLING carousel is a TAB, not a rail —
 * an identical "Хіти продажів" rail underneath the tab it duplicates would just be
 * broken-looking demo data.
 *
 * Idempotent: carousels upsert on deterministic ids, MANUAL items are replaced
 * wholesale, tabs upsert on (block, carousel), and a CAROUSEL block is created only
 * when no block shows that carousel yet. The storefront renders correctly with ZERO
 * carousels, so this is a convenience, not a requirement. Must run AFTER
 * seedCategories/seedProducts.
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

  const created = await seedHomeBlocks(prisma, carousels, now);

  const tabCount = carousels.filter((c) => c.home === 'tab').length;
  console.log(
    `  ✓ Carousels: ${carousels.length} published (${tabCount} tabs, ${carousels.length - tabCount} rails, ${picks.length} manual items); home blocks created: ${created}`,
  );
}

/**
 * Put the seeded carousels on the homepage (TASK-660). Returns how many blocks it had
 * to create — on a migrated database the system blocks and the «Популярне» TABS block
 * already exist, so this is normally just the tabs and the two rails.
 */
async function seedHomeBlocks(
  prisma: PrismaClient,
  carousels: ReturnType<typeof buildCarousels>,
  now: Date,
): Promise<number> {
  let created = 0;
  const published = { status: 'PUBLISHED' as const, publishedAt: now, scheduledAt: null };

  for (const type of SYSTEM_BLOCKS) {
    const exists = await prisma.homeBlock.findFirst({ where: { type } });
    if (!exists) {
      await prisma.homeBlock.create({ data: { type, ...published } });
      created += 1;
    }
  }

  let tabsBlock = await prisma.homeBlock.findFirst({
    where: { type: 'TABS' },
    orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
  });
  if (!tabsBlock) {
    tabsBlock = await prisma.homeBlock.create({
      data: { type: 'TABS', title: 'Популярне', ...published },
    });
    created += 1;
  }

  const tabs = carousels.filter((c) => c.home === 'tab');
  for (const [index, c] of tabs.entries()) {
    const carouselId = deterministicUuid(`carousel:${c.slug}`);
    await prisma.homeBlockTab.upsert({
      where: { homeBlockId_carouselId: { homeBlockId: tabsBlock.id, carouselId } },
      update: { sortOrder: index },
      create: { homeBlockId: tabsBlock.id, carouselId, sortOrder: index },
    });
  }

  for (const c of carousels.filter((entry) => entry.home === 'rail')) {
    const carouselId = deterministicUuid(`carousel:${c.slug}`);
    const shown = await prisma.homeBlock.findFirst({ where: { type: 'CAROUSEL', carouselId } });
    if (!shown) {
      await prisma.homeBlock.create({ data: { type: 'CAROUSEL', carouselId, ...published } });
      created += 1;
    }
  }

  // Place what was created where the old page.tsx had it: a stable sort by section rank
  // keeps the relative order of everything that already existed.
  if (created > 0) {
    const blocks = await prisma.homeBlock.findMany({
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }],
      select: { id: true, type: true, sortOrder: true },
    });
    const ordered = [...blocks].sort((a, b) => PAGE_RANK[a.type] - PAGE_RANK[b.type]);
    for (const [index, block] of ordered.entries()) {
      if (block.sortOrder !== index) {
        await prisma.homeBlock.update({ where: { id: block.id }, data: { sortOrder: index } });
      }
    }
  }

  return created;
}
