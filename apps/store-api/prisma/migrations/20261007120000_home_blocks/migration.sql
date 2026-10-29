-- ─────────────────────────────────────────────────────────────────────────────
-- The homepage as a list of blocks (TASK-660, plan 186, owner's decision B-9).
--
-- WHAT. Until now the order of the homepage sections was JSX in
-- `store-client/src/app/page.tsx`, and the only data-driven part was WHICH
-- carousels rendered, split by `Carousel.placement`: HOME_TABS fed the single
-- «Популярне» tab section, HOME_RAILS the standalone rails under it. From this
-- deploy on the page is `home_blocks` in `sort_order`: a block says a section
-- exists, where it stands and whether it is live. `home_block_tabs` holds the tabs
-- of a TABS block — any number of TABS blocks, which is why `placement` goes.
--
-- THREE STEPS, ONE TRANSACTION. Prisma sends this file to Postgres as one
-- multi-statement script, which Postgres runs as a single implicit transaction:
-- either the page is rebuilt AND the old column is gone, or nothing happened.
--
--   1. One block per section of today's page.tsx, in today's order: HERO(0),
--      TRUST(1), CATEGORY_NAV(2), TABS(3, «Популярне»), then one CAROUSEL block per
--      HOME_RAILS carousel in its (sort_order, created_at, id) order — the exact
--      tiebreak of the old public read — then PROMO_BANNER, RECENTLY_VIEWED,
--      NEWSLETTER. All PUBLISHED.
--   2. Every HOME_TABS carousel becomes a tab of that single TABS block, in the
--      same order.
--   3. Only then: renumber the carousels into ONE admin list, drop the placement
--      index, the column and the type.
--
-- WHY CAROUSELS OF EVERY STATUS. A block or tab is created for every carousel of
-- the placement, PUBLISHED or not. The public read hides a CAROUSEL block whose
-- carousel is not PUBLISHED and a tab whose carousel is not PUBLISHED, so the
-- visible page is identical before and after — and "publish a carousel I prepared
-- earlier and it appears where it was meant to" keeps working as it did yesterday.
-- Backfilling only the published ones would silently drop a scheduled carousel
-- from the page the moment the cron publishes it.
--
-- WHY THE TABS BLOCK IS CREATED EVEN WITH NO TABS. Today «Популярне» always
-- renders: with no HOME_TABS carousel it falls back to its query-driven tabs. The
-- block keeps that section on the page, and the storefront keeps the fallback.
--
-- THE GATE. `test/home-blocks-backfill.int-spec.ts` rebuilds the pre-migration
-- state on real Postgres (carousels of both placements, every status, shuffled
-- sort orders), runs THIS file, reads the page through the real HomeBlock
-- repository + service and asserts the same section list in the same order as
-- the old page.tsx produced.
--
-- REPLAY. Step 1 runs only into an empty `home_blocks`, step 2 is
-- ON CONFLICT DO NOTHING, step 3 uses IF EXISTS, so re-running the data half
-- cannot duplicate the page.
--
-- Measured 2026-10-07 on a copy of store_dev (seeded: 3 HOME_TABS + 2 HOME_RAILS,
-- all PUBLISHED): home_blocks 0 → 9 (HERO, TRUST, CATEGORY_NAV, TABS «Популярне»,
-- 2 × CAROUSEL, PROMO_BANNER, RECENTLY_VIEWED, NEWSLETTER), home_block_tabs 0 → 3,
-- carousels 5 → 5 (sort_order renumbered 0..4: tabs first, then rails).
-- On store_test (no carousels): home_blocks 0 → 7, home_block_tabs 0 → 0.
-- Invariant to re-check after deploy (must be 0 — one tab per former tab carousel
-- is no longer checkable once the column is gone, so check the shape instead):
--   SELECT COUNT(*) FROM home_blocks b WHERE b.type <> 'CAROUSEL' AND b.carousel_id IS NOT NULL;
-- ─────────────────────────────────────────────────────────────────────────────

-- CreateEnum
CREATE TYPE "HomeBlockType" AS ENUM ('HERO', 'TRUST', 'CATEGORY_NAV', 'TABS', 'CAROUSEL', 'PROMO_BANNER', 'RECENTLY_VIEWED', 'NEWSLETTER');

-- CreateTable
CREATE TABLE "home_blocks" (
    "id" TEXT NOT NULL,
    "type" "HomeBlockType" NOT NULL,
    "title" TEXT,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "status" "PublishStatus" NOT NULL DEFAULT 'DRAFT',
    "published_at" TIMESTAMP(3),
    "scheduled_at" TIMESTAMP(3),
    "carousel_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "home_blocks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "home_block_tabs" (
    "id" TEXT NOT NULL,
    "home_block_id" TEXT NOT NULL,
    "carousel_id" TEXT NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "home_block_tabs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "home_blocks_status_sort_order_idx" ON "home_blocks"("status", "sort_order");

-- CreateIndex
CREATE INDEX "home_blocks_carousel_id_idx" ON "home_blocks"("carousel_id");

-- CreateIndex
CREATE INDEX "home_block_tabs_home_block_id_sort_order_idx" ON "home_block_tabs"("home_block_id", "sort_order");

-- CreateIndex
CREATE INDEX "home_block_tabs_carousel_id_idx" ON "home_block_tabs"("carousel_id");

-- CreateIndex
CREATE UNIQUE INDEX "home_block_tabs_home_block_id_carousel_id_key" ON "home_block_tabs"("home_block_id", "carousel_id");

-- AddForeignKey
ALTER TABLE "home_blocks" ADD CONSTRAINT "home_blocks_carousel_id_fkey" FOREIGN KEY ("carousel_id") REFERENCES "carousels"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "home_block_tabs" ADD CONSTRAINT "home_block_tabs_home_block_id_fkey" FOREIGN KEY ("home_block_id") REFERENCES "home_blocks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "home_block_tabs" ADD CONSTRAINT "home_block_tabs_carousel_id_fkey" FOREIGN KEY ("carousel_id") REFERENCES "carousels"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ── Step 1: the page as it is today ─────────────────────────────────────────
-- `band` is the section's slot in the old page.tsx, `pos` the order inside a band
-- (only the rails band has more than one row). The final sort_order is the dense
-- rank over (band, pos), so the rails push the three lower sections down exactly
-- as the JSX did.
INSERT INTO "home_blocks" ("id", "type", "title", "sort_order", "status", "published_at", "carousel_id", "created_at", "updated_at")
SELECT
  gen_random_uuid()::text,
  section."type"::"HomeBlockType",
  section."title",
  (ROW_NUMBER() OVER (ORDER BY section."band", section."pos"))::int - 1,
  'PUBLISHED'::"PublishStatus",
  now(),
  section."carousel_id",
  now(),
  now()
FROM (
  SELECT 0 AS "band", 0::bigint AS "pos", 'HERO'::text AS "type", NULL::text AS "title", NULL::text AS "carousel_id"
  UNION ALL SELECT 1, 0, 'TRUST', NULL, NULL
  UNION ALL SELECT 2, 0, 'CATEGORY_NAV', NULL, NULL
  UNION ALL SELECT 3, 0, 'TABS', 'Популярне', NULL
  UNION ALL
  SELECT 4, ROW_NUMBER() OVER (ORDER BY c."sort_order", c."created_at", c."id"), 'CAROUSEL', NULL, c."id"
  FROM "carousels" c
  WHERE c."placement" = 'HOME_RAILS'
  UNION ALL SELECT 5, 0, 'PROMO_BANNER', NULL, NULL
  UNION ALL SELECT 6, 0, 'RECENTLY_VIEWED', NULL, NULL
  UNION ALL SELECT 7, 0, 'NEWSLETTER', NULL, NULL
) AS section
WHERE NOT EXISTS (SELECT 1 FROM "home_blocks");

-- ── Step 2: the «Популярне» tabs ────────────────────────────────────────────
INSERT INTO "home_block_tabs" ("id", "home_block_id", "carousel_id", "sort_order", "created_at")
SELECT
  gen_random_uuid()::text,
  tabs_block."id",
  c."id",
  (ROW_NUMBER() OVER (ORDER BY c."sort_order", c."created_at", c."id"))::int - 1,
  now()
FROM "carousels" c
CROSS JOIN (
  SELECT b."id"
  FROM "home_blocks" b
  WHERE b."type" = 'TABS'
  ORDER BY b."sort_order", b."created_at", b."id"
  LIMIT 1
) AS tabs_block
WHERE c."placement" = 'HOME_TABS'
ON CONFLICT ("home_block_id", "carousel_id") DO NOTHING;

-- ── Step 3: one admin list of carousels, then drop the placement ────────────
-- The two placement buckets were two independent 0..n sequences. Without a
-- placement they collide, so renumber into the order the admin list showed them
-- in (placement, then sort_order) — tabs first, then rails, nothing reshuffled.
WITH ranked AS (
  SELECT c."id",
         (ROW_NUMBER() OVER (ORDER BY c."placement", c."sort_order", c."created_at", c."id"))::int - 1 AS "position"
  FROM "carousels" c
)
UPDATE "carousels" AS t
SET "sort_order" = ranked."position"
FROM ranked
WHERE t."id" = ranked."id"
  AND t."sort_order" IS DISTINCT FROM ranked."position";

-- DropIndex
DROP INDEX IF EXISTS "carousels_placement_status_sort_order_idx";

-- AlterTable
ALTER TABLE "carousels" DROP COLUMN IF EXISTS "placement";

-- DropEnum
DROP TYPE IF EXISTS "CarouselPlacement";
