-- ─────────────────────────────────────────────────────────────────────────────
-- Give the returns queue's two permissions to the roles that already run orders
-- (TASK-370 / TASK-469, plan 180). Owner's decision, 2026-09-14.
--
-- THE PROBLEM THIS SOLVES. `permission.catalog.ts` opens with "DEFAULT IS
-- DENIED": a permission with no `role_permissions` row is held by nobody but the
-- owner. `returns:read` and `returns:write` have existed as keys since TASK-334
-- and have never had a single `role_permissions` row in any migration — so the
-- whole RMA screen, which has been built and working since TASK-340, has been
-- reachable by exactly one person in the shop.
--
-- TASK-370 is what makes that fatal rather than merely quiet. It puts
-- «Повернення» in the admin nav under `returns:read`, and the nav hides what the
-- session cannot use. Without these rows the owner sees the new menu entry and
-- every MANAGER sees nothing at all — no error, no visible 403, just a menu that
-- is one item shorter than the one in the manual. That is the same class of
-- defect that shipped twice already (wave 177's `media:*`, wave 183's
-- `reviews:write`): a new key gating an old screen, with no backfill.
--
-- WHY A BACKFILL IS DEFENSIBLE HERE AND NOT IN GENERAL. These keys are not new
-- reach. A role holding `orders:write` can already move an order to REFUNDED,
-- which is the money half of a return, and `orders:read` already shows it every
-- line, price and address a return names. What the returns queue adds is the
-- RECORD of that decision — which lines came back, how many, and whether they
-- were credited to stock. Granting it follows an existing grant one-for-one; it
-- opens nothing that was closed. The eligibility set is `orders:write` rather
-- than `orders:read` deliberately: resolving a return moves stock and money, so
-- it belongs with the roles trusted to write orders, not merely to look at them.
--
-- "ALREADY HAS THE PERMISSION" IS DEFINED HERE EXACTLY AS THE RUNTIME DEFINES
-- IT. `PermissionRepository.findGrantedByRole` reads
-- `WHERE role = ? AND allowed = true`, so a row with `allowed = false` — the
-- shape a DELIBERATE revocation takes, as opposed to "never configured" — is not
-- a grant, and this statement does not treat it as one. Getting that predicate
-- wrong in either direction is the whole risk of a backfill: looser, and a role
-- the owner explicitly stripped of orders gets the returns queue anyway;
-- stricter, and the operators this migration exists for do not get it.
--
-- ADMIN is deliberately absent: the owner is never subject to the matrix and
-- holds every permission by construction (`PermissionService.roleHasPermission`
-- short-circuits on ADMIN), so a row for ADMIN would be inert at best and an
-- invitation to believe the matrix governs the owner at worst.
--
-- CACHE. `PermissionService` caches a role's grant set in Redis for 60 seconds
-- and evicts explicitly on every write THROUGH the service. This write does not
-- go through it, so the new keys can take up to that TTL to appear for a session
-- that was active across the deploy. That is precisely the backstop the TTL was
-- documented for, and a deploy restarts the API anyway.
-- WHAT THIS ACTUALLY GRANTS TODAY: NOTHING, AND THAT IS THE HONEST OUTCOME.
-- Measured on 2026-09-15 against `store_dev` and a database built from these
-- migrations alone: `role_permissions` holds exactly ONE row in the whole shop
-- (`MANAGER / reviews:write`), so the eligibility set above — roles already
-- holding `orders:write` — is empty and this statement inserts zero rows. Wave
-- 177's `media:*` backfill has the same shape and the same result. The matrix is
-- filled in by the owner ticking boxes in the admin panel, not by the seed, and
-- nothing in code grants a MANAGER anything by default.
--
-- Left conditional on purpose (owner's decision, 2026-09-15). An unconditional
-- grant would hand return decisions — money leaving the shop — to a role that
-- currently cannot touch an order at all, which is exactly the "security
-- regression delivered by a feature release" that `PermissionService`'s docblock
-- exists to prevent. The migration says "whoever runs orders also runs returns";
-- when that becomes true of somebody, it will be true of returns too.
--
-- WHY THE GUARD BELOW. Plan 181 (TASK-475) DROPS `role_permissions` entirely,
-- moving grants from the role to the person. Its migration is stamped
-- `20260914160000`, which sorts BEFORE this one, so on a develop that has merged
-- both waves a clean `prisma migrate deploy` would replay them in that order and
-- this INSERT would hit a table that no longer exists — failing the deploy
-- outright rather than at some later, noticeable moment. Verified 2026-09-15:
-- the shared `store_test` database, already migrated by that wave, has no
-- `role_permissions` table at all. The guard makes this migration a no-op in
-- that world instead of a landmine, in either merge order.
-- ─────────────────────────────────────────────────────────────────────────────

DO $$
BEGIN
  IF to_regclass('public.role_permissions') IS NULL THEN
    RAISE NOTICE 'role_permissions is gone (plan 181) — skipping the returns backfill';
    RETURN;
  END IF;

  INSERT INTO "role_permissions" ("id", "role", "permission", "allowed", "created_at", "updated_at")
  SELECT
    gen_random_uuid()::text,
    eligible."role",
    new_key."permission",
    true,
    now(),
    now()
  FROM (
    SELECT DISTINCT rp."role"
    FROM "role_permissions" rp
    WHERE rp."allowed" = true
      AND rp."permission" = 'orders:write'
  ) AS eligible
  CROSS JOIN (VALUES ('returns:read'), ('returns:write')) AS new_key("permission")
  -- Idempotent, and it also means a role that somehow already holds one of the two
  -- keys keeps whatever `allowed` value it has rather than being silently re-granted.
  ON CONFLICT ("role", "permission") DO NOTHING;
END
$$;
