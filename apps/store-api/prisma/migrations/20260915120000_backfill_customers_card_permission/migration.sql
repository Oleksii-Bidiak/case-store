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
-- NO `is_active` / `deleted_at` FILTER, WHICH IS THE ONE PLACE THIS DIFFERS FROM
-- THE TASK-474 BACKFILL. That one CREATED rows from a role for people who had
-- none, so granting them to a switched-off account would have left it armed for
-- whoever re-enabled it. This one only preserves the meaning of a row that
-- already exists: a deactivated operator holding `customers:read` can open the
-- card today, and skipping their copy would quietly NARROW them on re-activation
-- instead of leaving them where they were. Either way the guard refuses a
-- deactivated account on every request, so the row grants nothing while it sits
-- there.
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
