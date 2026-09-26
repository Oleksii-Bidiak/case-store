-- ─────────────────────────────────────────────────────────────────────────────
-- Give `analytics:revenue` to everybody who holds `analytics:read` today, on the
-- PERSON and on templates (TASK-684, plan 188).
--
-- WHAT. `analytics:revenue` is the money carved out of `analytics:read`: revenue,
-- unrealized revenue, average order value, the revenue chart and the sums in the
-- top-products list. From this deploy on, `GET /admin/dashboard/summary` omits
-- them for anyone without the new key — the API cuts them, not the component,
-- because the admin is a public bundle and the network tab shows whatever the
-- server sent.
--
-- WHY A BACKFILL, AND WHY IT IS MANDATORY. Until now `analytics:read` WAS the
-- revenue. Shipped default-denied, the new key would make the revenue tiles
-- vanish overnight for every manager who read them yesterday — no 403, no
-- message, a dashboard that reads as "the shop sold nothing". The owner's
-- decision B-8 №9 (plan 178) makes the copy mandatory. The grant follows the
-- existing one one-for-one and adds no reach; after the deploy the owner can
-- take the money away from anyone by unticking one box. `permission.catalog.spec.ts`
-- pins these keys against ANALYTICS_REVENUE_BACKFILL_SOURCE_PERMISSIONS /
-- ANALYTICS_REVENUE_PERMISSIONS.
--
-- PER PERSON — THE LESSON OF WAVE 180. A conditional backfill written against
-- the role matrix inserted zero rows on every database measured: the matrix held
-- one row for the whole shop. Grants are `user_permissions` rows since plan 181,
-- so this reads and writes the person, then templates (a template is what the
-- next hire is set up from, so one that offered the dashboard must keep offering
-- its numbers). No role, no `allowed` column: the row IS the grant, a revocation
-- is its absence, and ADMIN holds every key by level without a row. The same
-- shape as `20260925100000_backfill_media_permissions_per_user`;
-- `test/analytics-revenue-backfill.int-spec.ts` replays this file on real rows.
--
-- Measured row counts, 2026-09-26 (`prisma migrate deploy`):
--   store_dev — `user_permissions` and `permission_template_items` hold no
--     analytics key at all (0 → 0); the seed grants nothing, so this file is a
--     no-op there. Counted, not assumed.
--   store_test_684 with a fixture (A: read; B: read + revenue; C: neither;
--     template T1: read; T2: neither):
--       user_permissions        analytics:read 2 → 2, analytics:revenue 1 → 2
--       permission_template_items analytics:read 1 → 1, analytics:revenue 0 → 1
--       holders of read without revenue: people 1 → 0, templates 1 → 0
--     A and T1 gained the key, B was left alone by ON CONFLICT, C and T2 got
--     nothing. `migrate diff` against the schema afterwards: empty.
--   Invariant to re-check on any database after deploy (must be 0):
--     SELECT COUNT(*) FROM user_permissions r WHERE r.permission = 'analytics:read'
--       AND NOT EXISTS (SELECT 1 FROM user_permissions v
--                       WHERE v.user_id = r.user_id AND v.permission = 'analytics:revenue');
--
-- Idempotent in both halves: a restore-then-migrate replays every file here.
-- ─────────────────────────────────────────────────────────────────────────────

INSERT INTO "user_permissions" ("id", "user_id", "permission", "created_at", "updated_at")
SELECT
  gen_random_uuid()::text,
  eligible."user_id",
  new_key."permission",
  now(),
  now()
FROM (
  SELECT DISTINCT up."user_id"
  FROM "user_permissions" up
  WHERE up."permission" IN ('analytics:read')
) AS eligible
CROSS JOIN (VALUES ('analytics:revenue')) AS new_key("permission")
ON CONFLICT ("user_id", "permission") DO NOTHING;

INSERT INTO "permission_template_items" ("id", "template_id", "permission", "created_at")
SELECT
  gen_random_uuid()::text,
  eligible."template_id",
  new_key."permission",
  now()
FROM (
  SELECT DISTINCT item."template_id"
  FROM "permission_template_items" item
  WHERE item."permission" IN ('analytics:read')
) AS eligible
CROSS JOIN (VALUES ('analytics:revenue')) AS new_key("permission")
ON CONFLICT ("template_id", "permission") DO NOTHING;
