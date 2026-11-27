import { HomeBlockType, PrismaClient, PublishStatus } from '@prisma/client';
import { resolvePublishState } from '../../../src/publishing/resolve-publish-state';
import { buildCarousels, type SeedCarousel } from '../data/content/carousels.data';
import { deterministicUuid } from '../lib/ids';

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * A carousel's (and its rail block's) publish fields, resolved by the domain's
 * own `resolvePublishState` — a schedule that is not in the future would
 * collapse to PUBLISHED there, so the seed fails rather than plant it.
 */
function publishFieldsFor(c: SeedCarousel, now: Date) {
  if (c.state === 'DRAFT') return resolvePublishState({ status: PublishStatus.DRAFT }, now);
  if (!c.state) return resolvePublishState({ status: PublishStatus.PUBLISHED }, now);
  const scheduledAt = new Date(now.getTime() + c.state.scheduledInDays * DAY_MS);
  const resolved = resolvePublishState({ status: PublishStatus.SCHEDULED, scheduledAt }, now);
  if (resolved.status !== PublishStatus.SCHEDULED) {
    throw new Error(`seedCarousels: "${c.slug}" must be scheduled into the future`);
  }
  return resolved;
}

/**
 * The order of the homepage sections as the old hard-coded `page.tsx` had it — the
 * same order the `…_home_blocks` migration backfills (TASK-660). Used ONLY to place
 * blocks this seeder had to CREATE (see `placeCreatedBlocks`): blocks that already
 * existed keep their order, so an admin's arrangement survives a re-seed.
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
 *   (TASK-2569) a SCHEDULED rail whose block is scheduled for the same instant,
 *           and a DRAFT carousel that is on no block.
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
  const railCategories = await prisma.category.findMany({
    where: { slug: { in: ['cases', 'power-banks', 'headphones'] } },
    select: { id: true, slug: true },
  });
  const categoryBySlug = Object.fromEntries(railCategories.map((c) => [c.slug, { id: c.id }]));

  const now = new Date();

  const carousels = buildCarousels(categoryBySlug);

  for (const c of carousels) {
    const id = deterministicUuid(`carousel:${c.slug}`);
    const data = {
      title: c.title,
      source: c.source,
      categoryId: c.categoryId ?? null,
      itemLimit: c.itemLimit ?? 12,
      sortOrder: c.sortOrder,
      ...publishFieldsFor(c, now),
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

  const count = (pick: (c: SeedCarousel) => boolean) => carousels.filter(pick).length;
  console.log(
    `  ✓ Carousels: ${carousels.length} (${count((c) => !c.state)} published, ` +
      `${count((c) => typeof c.state === 'object')} scheduled, ${count((c) => c.state === 'DRAFT')} draft; ` +
      `${count((c) => c.home === 'tab')} tabs, ${count((c) => c.home === 'rail')} rails, ` +
      `${picks.length} manual items); home blocks created: ${created}`,
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
  const createdIds: string[] = [];
  const published = { status: 'PUBLISHED' as const, publishedAt: now, scheduledAt: null };

  for (const type of SYSTEM_BLOCKS) {
    const exists = await prisma.homeBlock.findFirst({ where: { type } });
    if (!exists) {
      const block = await prisma.homeBlock.create({ data: { type, ...published } });
      createdIds.push(block.id);
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
    createdIds.push(tabsBlock.id);
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
    // A scheduled rail's block goes live together with its carousel (TASK-2569);
    // the date is the seed's, so it is rewritten on every run like the carousel's.
    const scheduled = typeof c.state === 'object';
    const state = scheduled ? publishFieldsFor(c, now) : published;
    const shown = await prisma.homeBlock.findFirst({ where: { type: 'CAROUSEL', carouselId } });
    if (!shown) {
      const block = await prisma.homeBlock.create({
        data: { type: 'CAROUSEL', carouselId, ...state },
      });
      createdIds.push(block.id);
    } else if (scheduled) {
      await prisma.homeBlock.update({ where: { id: shown.id }, data: state });
    }
  }

  if (createdIds.length > 0) {
    await placeCreatedBlocks(prisma, createdIds);
  }
  return createdIds.length;
}

/**
 * Slot the blocks this seeder just CREATED into the page where the old page.tsx had
 * their kind of section, WITHOUT moving any block that already existed: the existing
 * blocks keep exactly the order they had (an admin may have rearranged the page), and
 * each new block goes right after the last block whose section rank is not greater
 * than its own (`PAGE_RANK`) — at the top when there is none. The page is then
 * renumbered densely `0..n-1`, writing only rows whose number changed.
 */
async function placeCreatedBlocks(prisma: PrismaClient, createdIds: string[]): Promise<void> {
  const created = new Set(createdIds);
  const blocks = await prisma.homeBlock.findMany({
    orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }],
    select: { id: true, type: true, sortOrder: true },
  });

  const page = blocks.filter((block) => !created.has(block.id));
  // New blocks in section order; same rank keeps creation order (a stable sort).
  const fresh = createdIds
    .map((id) => blocks.find((block) => block.id === id))
    .filter((block): block is (typeof blocks)[number] => block !== undefined)
    .sort((a, b) => PAGE_RANK[a.type] - PAGE_RANK[b.type]);

  for (const block of fresh) {
    let at = 0;
    page.forEach((existing, index) => {
      if (PAGE_RANK[existing.type] <= PAGE_RANK[block.type]) at = index + 1;
    });
    page.splice(at, 0, block);
  }

  for (const [index, block] of page.entries()) {
    if (block.sortOrder !== index) {
      await prisma.homeBlock.update({ where: { id: block.id }, data: { sortOrder: index } });
    }
  }
}
