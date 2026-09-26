-- ─────────────────────────────────────────────────────────────────────────────
-- A page slug is unique per KIND, and the slug-redirect ledger is keyed by
-- ADDRESS rather than by bare slug (TASK-566, plan 193).
--
-- THE DEFECT. Since wave 176 pages live in two namespaces (`/legal/<slug>`,
-- `/info/<slug>`) plus six HUB rows that carry meta tags and have no address
-- at all — yet `pages.slug` stayed globally unique. `/legal/delivery` and
-- `/info/delivery` could not coexist, and an attempt to create a document
-- called `contact` answered 409 «Slug is already taken» because the HUB row
-- `contact` (on a different admin tab) owned it.
--
-- Relaxing that alone would have broken the redirect ledger: its key was
-- (entity, old_slug), so an INFO page renamed away from `delivery` would
-- overwrite the LEGAL page's `delivery` redirect, and the chain collapse would
-- repoint the LEGAL page's aliases at the INFO page. The ledger therefore gets
-- the namespace of each side of the redirect:
--   scope      — the kind whose route served the DEAD address (PAGE rows);
--   new_scope  — the kind the LIVE page is served under (PAGE rows);
-- both '' for the single-namespace entities (BLOG_POST, PRODUCT, CATEGORY,
-- DEVICE_MODEL), whose rows keep their exact meaning.
--
-- BACKFILL (hand-written, below the generated DDL). Before this migration a
-- PAGE row carried no namespace, so the public lookup answered it for EVERY
-- page route: `/legal/<old>` and `/info/<old>` both resolved to it. To keep
-- that behaviour exactly, every existing PAGE row is written into BOTH page
-- namespaces — the existing row becomes the LEGAL one (every rename before wave
-- 176 happened under `/legal`), and a copy is inserted for INFO. No key
-- collision is possible: old_slug was unique per entity until this migration.
-- new_scope is the current kind of the page holding new_slug (slugs are still
-- globally unique at this point, so the match is exact); a redirect whose page
-- was since deleted gets 'LEGAL' — the storefront verifies the target and
-- 404s it, as it did before.
--
-- The DDL itself never touches data: dropping the global slug key and adding
-- (kind, slug) cannot fail on rows that satisfied the stricter rule.
--
-- ROW COUNTS — store_test_193 itself: pages 0, slug_redirects 0 before and
-- after. Measured additionally inside a rolled-back transaction over a fixture
-- (pages: LEGAL privacy, INFO about, HUB contact; ledger: PAGE old-privacy →
-- privacy, PAGE old-about → about, PAGE gone → deleted page, PRODUCT p-old →
-- p-new):
--   before: slug_redirects 4 — PAGE 3, PRODUCT 1 (no scope columns)
--   after:  slug_redirects 7 — PAGE 6 (LEGAL 3, INFO 3; new_scope LEGAL 4,
--           INFO 2), PRODUCT 1 (scope '' / new_scope '')
--   pages unchanged: 3.

-- DropIndex
DROP INDEX "pages_slug_key";

-- DropIndex
DROP INDEX "slug_redirects_entity_new_slug_idx";

-- DropIndex
DROP INDEX "slug_redirects_entity_old_slug_key";

-- AlterTable
ALTER TABLE "slug_redirects" ADD COLUMN     "new_scope" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "scope" TEXT NOT NULL DEFAULT '';

-- CreateIndex
CREATE UNIQUE INDEX "pages_kind_slug_key" ON "pages"("kind", "slug");

-- CreateIndex
CREATE INDEX "slug_redirects_entity_new_scope_new_slug_idx" ON "slug_redirects"("entity", "new_scope", "new_slug");

-- CreateIndex
CREATE UNIQUE INDEX "slug_redirects_entity_scope_old_slug_key" ON "slug_redirects"("entity", "scope", "old_slug");

-- ── Backfill 1: existing PAGE rows become the LEGAL-scoped redirects and learn
--    the kind their live page is served under. ────────────────────────────────
UPDATE "slug_redirects" AS r
SET "scope" = 'LEGAL',
    "new_scope" = COALESCE(
      (SELECT p."kind"::text FROM "pages" AS p
       WHERE p."slug" = r."new_slug"
       ORDER BY p."kind"
       LIMIT 1),
      'LEGAL'
    )
WHERE r."entity" = 'PAGE';

-- ── Backfill 2: the same redirects answer under /info too, as they did before.
INSERT INTO "slug_redirects" (
  "id", "entity", "scope", "old_slug", "new_scope", "new_slug", "created_at", "updated_at"
)
SELECT
  gen_random_uuid()::text,
  r."entity",
  'INFO',
  r."old_slug",
  r."new_scope",
  r."new_slug",
  r."created_at",
  CURRENT_TIMESTAMP
FROM "slug_redirects" AS r
WHERE r."entity" = 'PAGE' AND r."scope" = 'LEGAL'
ON CONFLICT ("entity", "scope", "old_slug") DO NOTHING;
