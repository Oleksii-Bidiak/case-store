-- ─────────────────────────────────────────────────────────────────────────────
-- Give the returns queue's two permissions to the people who already run orders
-- (TASK-370 / TASK-469, plan 180, owner's decision 2026-09-14), on the PERSON.
--
-- WHY THIS EXISTS AT ALL, WHEN PLAN 180 ALREADY SHIPPED THAT BACKFILL. Because
-- the merge of the two waves, and not either wave on its own, made plan 180's
-- version a no-op. That migration inserts into `role_permissions` and is stamped
-- `20260914183500`. Plan 181 DROPS `role_permissions` at `20260914160000`, which
-- sorts EARLIER, so on a develop carrying both waves `prisma migrate deploy`
-- replays them in that order and plan 180's INSERT meets a table that is gone.
--
-- It does not fail the deploy — it guards itself with
-- `to_regclass('public.role_permissions') IS NULL` and skips, which its author
-- wrote deliberately after checking that plan 181 was coming. That guard is what
-- makes the merge safe in either direction, and it is correct.
--
-- But skipping is not granting. On a shop whose matrix actually held
-- `MANAGER / orders:write` — the client's stand, where the owner ticked boxes
-- during the 2026-08-27 run — the TASK-474 copy hands those operators
-- `orders:write` personally at `20260914140000`, and then nothing ever gives
-- them `returns:read`. They run orders and cannot see the returns queue, and the
-- «Повернення» menu entry TASK-370 added is invisible to them: no error, no 403
-- they can report, just a menu one item shorter than the one in the manual. That
-- is precisely the defect plan 180's migration was written to prevent,
-- re-created by the ordering rather than by either wave — and the ordering
-- belongs to this wave, so the repair does too.
--
-- The measurement plan 180 quotes ("this grants nothing today") was taken
-- against `store_dev` and `store_test`, where `role_permissions` held one row.
-- It is not a measurement of the client's stand, and it cannot be: that database
-- is the one place this could matter and the one place nobody has queried.
--
-- ELIGIBILITY IS PLAN 180'S, UNCHANGED. Whoever holds `orders:write` also runs
-- returns. `orders:write` rather than `orders:read` on purpose: resolving a
-- return moves stock and money, so it belongs with the people trusted to write
-- orders, not merely to read them. The grant follows an existing grant
-- one-for-one and opens nothing that was closed — a role holding `orders:write`
-- can already move an order to REFUNDED, which is the money half of a return.
-- Left CONDITIONAL, also unchanged: an unconditional grant would hand return
-- decisions to people who cannot touch an order at all.
--
-- WHAT CHANGED IS ONLY THE SHAPE. Grants are rows on the person now, so there is
-- no `role` to select and no `allowed` column to get wrong in either direction:
-- the row IS the grant and a revocation is its absence. That removes the whole
-- predicate plan 180's version had to argue about.
--
-- ADMIN AND THE OWNER ARE NOT NAMED, and that is not an omission: they hold
-- every catalogue key by level, without a row (`PermissionService`), so a row
-- for them would be inert at best and at worst would teach the next reader that
-- rows govern the owner.
--
-- Idempotent, like its predecessor: a restore-then-migrate replays every file in
-- this folder.
--
-- `permission.catalog.spec.ts` pins the keys and the source key below against
-- RETURNS_PERMISSIONS / RETURNS_BACKFILL_SOURCE_PERMISSIONS, so this statement
-- and the catalogue cannot drift apart silently.
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
  WHERE up."permission" IN ('orders:write')
) AS eligible
CROSS JOIN (VALUES ('returns:read'), ('returns:write')) AS new_key("permission")
ON CONFLICT ("user_id", "permission") DO NOTHING;

-- The same carve-out applied to TEMPLATES, for the same reason the
-- `customers:card` migration needed it: a template is what the next hire is set
-- up from, so a shop whose «Менеджер (як було)» offers `orders:write` must offer
-- the returns queue with it, or everybody hired after the deploy comes out
-- narrower than the colleague sitting next to them.
INSERT INTO "permission_template_items" ("id", "template_id", "permission", "created_at")
SELECT
  gen_random_uuid()::text,
  eligible."template_id",
  new_key."permission",
  now()
FROM (
  SELECT DISTINCT item."template_id"
  FROM "permission_template_items" item
  WHERE item."permission" IN ('orders:write')
) AS eligible
CROSS JOIN (VALUES ('returns:read'), ('returns:write')) AS new_key("permission")
ON CONFLICT ("template_id", "permission") DO NOTHING;
