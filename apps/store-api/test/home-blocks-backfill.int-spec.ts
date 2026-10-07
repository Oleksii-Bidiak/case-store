import { readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { ConfigModule } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { Carousel, CarouselSource, HomeBlockType, PublishStatus } from '@prisma/client';
import { randomUUID } from 'crypto';
import { PrismaService } from '../src/prisma';
import { CarouselService, PublicCarouselEntity } from '../src/carousels';
import { RevalidationNotifier } from '../src/publishing';
import { HomeBlockRepository } from '../src/home-block/home-block.repository';
import { HomeBlockService } from '../src/home-block/home-block.service';

/**
 * THE MERGE GATE OF TASK-660 (plan 186): after the `…_home_blocks` migration the
 * homepage shows THE SAME sections in THE SAME order as the hard-coded `page.tsx` did
 * before it — on real Postgres, through the real repository and service.
 *
 * The test rebuilds the pre-migration world inside a transaction that is always rolled
 * back: the home-block tables gone, `carousels.placement` and its enum back, carousels
 * of BOTH placements in EVERY status with shuffled sort orders and ties. It computes the
 * old page with {@link legacyHomeSections} — a pure transcription of the old JSX — then
 * runs the shipped migration file statement by statement and reads the page through
 * `HomeBlockService.findPublic()`. List AND order must be equal.
 *
 * And the property the backfill-every-status decision exists for: publishing a carousel
 * that was a draft before the migration makes it appear exactly where the old page would
 * have put it.
 *
 * Product resolution is stubbed (each carousel resolves to `[]`): what is under test is
 * which sections stand on the page and in what order, not what a carousel contains —
 * that path is `CarouselService.resolvePublic`, shared verbatim with `/api/carousels`.
 *
 * Requires an isolated `*_test` database already migrated (setup-int.ts forces the URL).
 */

type Placement = 'HOME_TABS' | 'HOME_RAILS';

interface LegacyCarousel {
  id: string;
  placement: Placement;
  status: PublishStatus;
  sortOrder: number;
  createdAt: Date;
}

/** A homepage section, as both the old and the new page are compared. */
interface Section {
  type: HomeBlockType;
  carouselId?: string;
  tabIds?: string[];
}

/**
 * The OLD `apps/store-client/src/app/page.tsx` (develop f7b4b29a), as data:
 *
 *   <HeroBanner/> <TrustStrip/> <CategoryNav/>
 *   <PopularRail carousels={HOME_TABS}/>          ← always rendered (fallback tabs when empty)
 *   <RecommendationCarousels carousels={HOME_RAILS}/>  ← one rail per carousel
 *   <PromoBanner/> <RecentlyViewed/> <Newsletter/>
 *
 * where HOME_TABS / HOME_RAILS were the PUBLISHED carousels of that placement, ordered
 * by `sortOrder, createdAt` (CarouselRepository.findAllPublished before TASK-660).
 */
function legacyHomeSections(carousels: readonly LegacyCarousel[]): Section[] {
  const published = (placement: Placement) =>
    carousels
      .filter((c) => c.placement === placement && c.status === PublishStatus.PUBLISHED)
      .sort(
        (a, b) =>
          a.sortOrder - b.sortOrder ||
          a.createdAt.getTime() - b.createdAt.getTime() ||
          a.id.localeCompare(b.id),
      )
      .map((c) => c.id);

  return [
    { type: HomeBlockType.HERO },
    { type: HomeBlockType.TRUST },
    { type: HomeBlockType.CATEGORY_NAV },
    { type: HomeBlockType.TABS, tabIds: published('HOME_TABS') },
    ...published('HOME_RAILS').map((id) => ({ type: HomeBlockType.CAROUSEL, carouselId: id })),
    { type: HomeBlockType.PROMO_BANNER },
    { type: HomeBlockType.RECENTLY_VIEWED },
    { type: HomeBlockType.NEWSLETTER },
  ];
}

describe('home blocks backfill (TASK-660) — the homepage is unchanged by the migration', () => {
  let prisma: PrismaService;

  class Rollback extends Error {}

  const statements = (() => {
    const root = resolve(__dirname, '../prisma/migrations');
    const dir = readdirSync(root).find((entry) => entry.endsWith('_home_blocks'));
    if (!dir) {
      throw new Error(`No *_home_blocks migration under ${root}`);
    }
    return readFileSync(join(root, dir, 'migration.sql'), 'utf8')
      .split('\n')
      .filter((line) => !line.trimStart().startsWith('--'))
      .join('\n')
      .split(';')
      .map((fragment) => fragment.trim())
      .filter((fragment) => fragment.length > 0);
  })();

  /** The pre-migration schema: no home-block tables, `carousels.placement` back. */
  const PRE_MIGRATION_DDL = [
    'DROP TABLE "home_block_tabs"',
    'DROP TABLE "home_blocks"',
    'DROP TYPE "HomeBlockType"',
    `CREATE TYPE "CarouselPlacement" AS ENUM ('HOME_TABS', 'HOME_RAILS')`,
    `ALTER TABLE "carousels" ADD COLUMN "placement" "CarouselPlacement" NOT NULL DEFAULT 'HOME_RAILS'`,
    'CREATE INDEX "carousels_placement_status_sort_order_idx" ON "carousels"("placement", "status", "sort_order")',
    // A clean slate of carousels (rolled back with everything else).
    'DELETE FROM "carousels"',
  ];

  /** Carousels of both placements, every status, shuffled sort orders and ties. */
  const FIXTURE: Array<Omit<LegacyCarousel, 'id' | 'createdAt'> & { tag: string }> = [
    { tag: 'tab-pub-2', placement: 'HOME_TABS', status: PublishStatus.PUBLISHED, sortOrder: 2 },
    { tag: 'tab-draft-0', placement: 'HOME_TABS', status: PublishStatus.DRAFT, sortOrder: 0 },
    { tag: 'tab-pub-0', placement: 'HOME_TABS', status: PublishStatus.PUBLISHED, sortOrder: 0 },
    { tag: 'tab-sched-1', placement: 'HOME_TABS', status: PublishStatus.SCHEDULED, sortOrder: 1 },
    { tag: 'tab-pub-5', placement: 'HOME_TABS', status: PublishStatus.PUBLISHED, sortOrder: 5 },
    { tag: 'rail-pub-3', placement: 'HOME_RAILS', status: PublishStatus.PUBLISHED, sortOrder: 3 },
    { tag: 'rail-pub-1', placement: 'HOME_RAILS', status: PublishStatus.PUBLISHED, sortOrder: 1 },
    { tag: 'rail-draft-2', placement: 'HOME_RAILS', status: PublishStatus.DRAFT, sortOrder: 2 },
    { tag: 'rail-sched-0', placement: 'HOME_RAILS', status: PublishStatus.SCHEDULED, sortOrder: 0 },
    // Same sortOrder as rail-pub-1, created later: the createdAt tiebreak must survive.
    { tag: 'rail-pub-1b', placement: 'HOME_RAILS', status: PublishStatus.PUBLISHED, sortOrder: 1 },
  ];

  const stubCarouselService = {
    resolvePublic: (carousels: readonly Carousel[]) =>
      Promise.resolve(carousels.map((carousel) => PublicCarouselEntity.fromEntity(carousel, []))),
  } as unknown as CarouselService;
  const stubRevalidation = {
    revalidate: () => Promise.resolve(),
  } as unknown as RevalidationNotifier;

  beforeAll(async () => {
    const url = process.env.DATABASE_URL ?? '';
    if (!/test/i.test(url)) {
      throw new Error(`Refusing to run integration tests against a non-test database: "${url}"`);
    }

    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true })],
      providers: [PrismaService],
    }).compile();

    prisma = moduleRef.get(PrismaService);
    await prisma.$connect();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  /** The page as the NEW code serves it, reduced to sections. */
  const toSections = (blocks: Awaited<ReturnType<HomeBlockService['findPublic']>>): Section[] =>
    blocks.map((block) => {
      if (block.type === HomeBlockType.TABS) {
        return { type: block.type, tabIds: block.tabs.map((tab) => tab.id) };
      }
      if (block.type === HomeBlockType.CAROUSEL) {
        return { type: block.type, carouselId: block.carousel?.id };
      }
      return { type: block.type };
    });

  /**
   * Rebuild the pre-migration world, seed `fixture`, migrate, and hand back what the old
   * and the new page show — plus a hook to act after the migration.
   */
  async function replay(
    fixture: typeof FIXTURE,
    afterMigration?: (
      tx: Parameters<Parameters<PrismaService['$transaction']>[0]>[0],
      ids: Record<string, string>,
    ) => Promise<LegacyCarousel[]>,
  ): Promise<{
    legacy: Section[];
    migrated: Section[];
    after?: { legacy: Section[]; migrated: Section[] };
  }> {
    let result:
      | {
          legacy: Section[];
          migrated: Section[];
          after?: { legacy: Section[]; migrated: Section[] };
        }
      | undefined;

    try {
      await prisma.$transaction(
        async (tx) => {
          for (const ddl of PRE_MIGRATION_DDL) {
            await tx.$executeRawUnsafe(ddl);
          }

          const base = Date.UTC(2026, 0, 1);
          const legacyRows: LegacyCarousel[] = [];
          const ids: Record<string, string> = {};
          for (const [index, row] of fixture.entries()) {
            const id = randomUUID();
            const createdAt = new Date(base + index * 60_000);
            await tx.carousel.create({
              data: {
                id,
                title: row.tag,
                source: CarouselSource.NEWEST,
                sortOrder: row.sortOrder,
                status: row.status,
                publishedAt: row.status === PublishStatus.PUBLISHED ? createdAt : null,
                scheduledAt:
                  row.status === PublishStatus.SCHEDULED ? new Date(Date.UTC(2099, 0, 1)) : null,
                createdAt,
              },
            });
            await tx.$executeRawUnsafe(
              `UPDATE "carousels" SET "placement" = '${row.placement}'::"CarouselPlacement" WHERE "id" = '${id}'`,
            );
            ids[row.tag] = id;
            legacyRows.push({
              id,
              placement: row.placement,
              status: row.status,
              sortOrder: row.sortOrder,
              createdAt,
            });
          }

          const legacy = legacyHomeSections(legacyRows);

          for (const statement of statements) {
            await tx.$executeRawUnsafe(statement);
          }

          const service = new HomeBlockService(
            new HomeBlockRepository(tx as unknown as PrismaService),
            stubCarouselService,
            stubRevalidation,
          );
          const migrated = toSections(await service.findPublic());

          let after: { legacy: Section[]; migrated: Section[] } | undefined;
          if (afterMigration) {
            const nextLegacyRows = await afterMigration(tx, ids);
            after = {
              legacy: legacyHomeSections(nextLegacyRows),
              migrated: toSections(await service.findPublic()),
            };
          }

          result = { legacy, migrated, after };
          throw new Rollback();
        },
        { timeout: 30_000, maxWait: 10_000 },
      );
    } catch (error) {
      if (!(error instanceof Rollback)) throw error;
    }

    if (!result) throw new Error('replay produced no result');
    return result;
  }

  it('serves the same sections in the same order as the old page.tsx', async () => {
    const { legacy, migrated } = await replay(FIXTURE);

    // Sanity: the fixture really exercises tabs, rails and the hidden statuses.
    expect(legacy.find((s) => s.type === HomeBlockType.TABS)?.tabIds).toHaveLength(3);
    expect(legacy.filter((s) => s.type === HomeBlockType.CAROUSEL)).toHaveLength(3);

    expect(migrated).toEqual(legacy);
  });

  it('keeps the «Популярне» section (with no tabs) when no tab carousel is published', async () => {
    const { legacy, migrated } = await replay(
      FIXTURE.filter(
        (row) => row.placement === 'HOME_RAILS' || row.status !== PublishStatus.PUBLISHED,
      ),
    );

    expect(legacy.find((s) => s.type === HomeBlockType.TABS)).toEqual({
      type: HomeBlockType.TABS,
      tabIds: [],
    });
    expect(migrated).toEqual(legacy);
  });

  it('shows a carousel that was a draft before the migration where the old page would have, once published', async () => {
    const { after } = await replay(FIXTURE, async (tx, ids) => {
      await tx.carousel.updateMany({
        where: { id: { in: [ids['rail-draft-2'], ids['tab-draft-0']] } },
        data: { status: PublishStatus.PUBLISHED },
      });
      const base = Date.UTC(2026, 0, 1);
      return FIXTURE.map((row, index) => ({
        id: ids[row.tag],
        placement: row.placement,
        status:
          row.tag === 'rail-draft-2' || row.tag === 'tab-draft-0'
            ? PublishStatus.PUBLISHED
            : row.status,
        sortOrder: row.sortOrder,
        createdAt: new Date(base + index * 60_000),
      }));
    });

    expect(after).toBeDefined();
    expect(after!.migrated).toEqual(after!.legacy);
  });
});
