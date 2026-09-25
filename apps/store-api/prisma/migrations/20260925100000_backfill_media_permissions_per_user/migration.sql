-- ─────────────────────────────────────────────────────────────────────────────
-- Give the media library's two permissions to the people who already put images
-- on our disk (TASK-441's backfill), on the PERSON (TASK-614, plan 192).
--
-- WHY THIS EXISTS. `20260914103000_backfill_media_permissions` inserted into
-- `role_permissions`, following a role's existing content-write grant. On every
-- database anyone measured it inserted ZERO rows: the role matrix held exactly
-- one row for the whole shop (`MANAGER / reviews:write`), so "roles that already
-- hold products:write…" matched nobody. Then plan 181 moved grants onto people
-- and dropped the matrix. From that point every content-write grant is a
-- `user_permissions` row made on the staff screen — and nothing ever looked at
-- those rows to hand the media picker along. A manager ticked «Товари:
-- редагування» after the deploy opens the product form and finds «Обрати з
-- медіатеки» empty: no error, no 403, just a panel that reads as broken.
--
-- ELIGIBILITY IS TASK-441'S, UNCHANGED, AND STILL CONDITIONAL. The owner's
-- decision of 2026-09-15 keeps backfills conditional: the grant follows an
-- EXISTING content-write grant one-for-one and adds no reach — every source key
-- below already uploads an image through its own route
-- (`POST /admin/uploads/{categories,brands,banners,blog}`,
-- `POST /admin/products/:id/images`); the library is where that upload lives
-- afterwards. `permission.catalog.spec.ts` pins these keys against
-- MEDIA_BACKFILL_SOURCE_PERMISSIONS / MEDIA_PERMISSIONS.
--
-- The same shape as `20260915130000_backfill_returns_permissions_per_user`:
-- people, then templates (a template is what the next hire is set up from, so
-- one offering `products:write` must offer the picker with it). No `allowed`
-- column, no role: the row IS the grant, a revocation is its absence, and ADMIN
-- holds every key by level without a row.
--
-- Measured before deploy (2026-09-25): store_dev — 0 people hold any permission
-- row at all (user_permissions is empty), so 0 people eligible, 0 rows to add;
-- 0 templates hold a source key. store_test — the same, 0 / 0 / 0. That is the
-- honest result, not a broken WHERE: the statements were verified against
-- probe rows on store_test (one eligible person, one ineligible, one eligible
-- template) and `test/access-model-backfill.int-spec.ts` replays this file.
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
  WHERE up."permission" IN (
    'products:write',
    'categories:write',
    'brands:write',
    'banners:write',
    'blog:write'
  )
) AS eligible
CROSS JOIN (VALUES ('media:read'), ('media:write')) AS new_key("permission")
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
  WHERE item."permission" IN (
    'products:write',
    'categories:write',
    'brands:write',
    'banners:write',
    'blog:write'
  )
) AS eligible
CROSS JOIN (VALUES ('media:read'), ('media:write')) AS new_key("permission")
ON CONFLICT ("template_id", "permission") DO NOTHING;
