-- ─────────────────────────────────────────────────────────────────────────────
-- Give `customers:card` to everybody who already holds `customers:read`
-- (TASK-479, plan 181).
--
-- WHAT THE SPLIT DID. `customers:read` was buying two purchases at once: the
-- customer list plus the contact details an operator needs in order to phone
-- somebody back, AND `GET /api/users/:id/admin-card` — lifetime value, every
-- order with its total, the text of every product review, every redeemed coupon
-- and the full text of every support message. The card moved behind its own key;
-- the list and the contacts did not.
--
-- WHY A BACKFILL, WHEN `permission.catalog.ts` OPENS WITH "DEFAULT IS DENIED".
-- Because this key is not a new admin SECTION. It is a screen every holder of
-- `customers:read` opens today. Shipping it denied-by-default would 403 an
-- operator on the morning after the deploy, on a page that worked for them the
-- evening before — and nobody would have decided that: not the owner, who never
-- saw a screen offering the choice, and not the operator, who sees an error where
-- a customer's history used to be. The grant below follows an existing grant
-- one-for-one. It preserves exactly yesterday's reach and opens nothing that was
-- closed.
--
-- That is the narrow case, and it is narrow on purpose. Compare `reviews:write`
-- (TASK-597), which deliberately shipped WITHOUT a migration: answering a
-- customer in public, under the shop's name, was something nobody could do
-- yesterday, so there was nothing to preserve and the first tick had to be the
-- owner's own decision.
--
-- PER PERSON, NOT PER ROLE. The media backfill (…_backfill_media_permissions)
-- inserted into `role_permissions`; TASK-475 moved grants onto the person and
-- TASK-476 dropped that table, so this one reads and writes `user_permissions`.
-- There is no `allowed` column to reason about any more either: the row IS the
-- grant, and a deliberate revocation is the row's absence — so the predicate the
-- media migration had to spell out carefully simply does not exist here.
--
-- NO `is_active` FILTER, AND THE TASK-474 BACKFILL NOW AGREES. This one only
-- preserves the meaning of a row that already exists: a deactivated operator
-- holding `customers:read` can open the card today, and skipping their copy would
-- quietly NARROW them on re-activation instead of leaving them where they were.
-- The guard refuses a deactivated account on every request anyway, so the row
-- grants nothing while it sits there.
--
-- That argument was originally written as the ONE place this migration differed
-- from the TASK-474 backfill, which did filter on `is_active = true`. The
-- 2026-09-15 review pointed out that two migrations in one wave answering the
-- same question opposite ways is a defect in whichever one is wrong, and it was
-- that one: `StaffService.setStatus(false)` deletes nobody's rows, so "switched
-- off" always keeps its permissions from this release onward. Both backfills now
-- use `deleted_at IS NULL` as the only liveness test, which is what the flags
-- mean — the tombstone is permanent, the toggle is not.
--
-- NO `deleted_at` FILTER EITHER, and for a duller reason: a tombstoned account
-- cannot hold a `customers:read` row to be eligible in the first place unless it
-- was tombstoned after being granted one, in which case the extra row changes
-- nothing about an account that can never sign in again.
--
-- NO ROLE IS NAMED ANYWHERE BELOW, and that is not an omission. An ADMIN and the
-- owner hold every catalogue key by level, without a row of their own
-- (`PermissionService`), so the only accounts with `customers:read` rows are the
-- managers this migration is for. A row for an admin would be inert at best, and
-- at worst it would teach the next reader that rows govern the owner.
--
-- `permission.catalog.spec.ts` pins the key and the source key below against
-- CUSTOMERS_CARD_PERMISSIONS / CUSTOMERS_CARD_BACKFILL_SOURCE_PERMISSIONS, so
-- this statement and the catalogue cannot drift apart silently.
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
  WHERE up."permission" IN ('customers:read')
) AS eligible
CROSS JOIN (VALUES ('customers:card')) AS new_key("permission")
-- Idempotent: a second run is a no-op, which is what makes a restore-then-migrate
-- recovery safe and lets the integration suite replay this block.
ON CONFLICT ("user_id", "permission") DO NOTHING;

-- ── The same carve-out applied to TEMPLATES ──────────────────────────────────
-- A template is a set of keys somebody copies onto the next hire, so a key that
-- was carved out of `customers:read` has to follow it into every template that
-- offered `customers:read` — otherwise the split reaches the people who already
-- work here and misses everybody hired afterwards.
--
-- «Менеджер (як було)» is the case that makes this not merely tidy. The TASK-474
-- migration created it from `role_permissions` one migration before this key
-- existed, and `docs/admin-guide.md` tells the owner it holds «рівно той набір
-- прав, який раніше отримував будь-хто з роллю «Менеджер»». Without this
-- statement that sentence stops being true in the same release that created the
-- template: an owner hiring through it produces somebody who holds
-- `customers:read`, opens a customer and gets a 403 on the card their colleague
-- with the identical level reads fine.
--
-- Written against every template rather than that one by name, because the shop
-- may already have templates the owner built by hand, and they were built while
-- `customers:read` still meant the card.
INSERT INTO "permission_template_items" ("id", "template_id", "permission", "created_at")
SELECT
  gen_random_uuid()::text,
  eligible."template_id",
  new_key."permission",
  now()
FROM (
  SELECT DISTINCT item."template_id"
  FROM "permission_template_items" item
  WHERE item."permission" IN ('customers:read')
) AS eligible
CROSS JOIN (VALUES ('customers:card')) AS new_key("permission")
ON CONFLICT ("template_id", "permission") DO NOTHING;
