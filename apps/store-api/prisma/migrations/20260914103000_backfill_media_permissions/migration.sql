-- ─────────────────────────────────────────────────────────────────────────────
-- Give the media library's two new permissions to the roles that already do the
-- thing they gate (TASK-441, plan 177).
--
-- THE PROBLEM THIS SOLVES. `permission.catalog.ts` opens with "DEFAULT IS
-- DENIED": a permission with no `role_permissions` row is held by nobody but the
-- owner, so shipping an admin section never silently hands it to an existing
-- MANAGER. That rule is right, and it is exactly what would break this feature.
-- `media:read` gates the "Обрати з медіатеки" picker that plan 177 puts inside
-- the product, category, brand, banner and article forms. Denied by default, the
-- picker renders empty for every content manager in the shop — no error, no
-- visible 403, just a panel with nothing in it, which reads as a broken screen
-- rather than as a permission somebody has to tick.
--
-- WHY A BACKFILL IS DEFENSIBLE HERE AND NOT IN GENERAL. These keys are not new
-- reach. Every role named below can ALREADY put an image on our disk through its
-- own upload route (`POST /admin/uploads/{categories,brands,banners,blog}`,
-- `POST /admin/products/:id/images`) — see the "WHY FOUR ROUTES AND NOT ONE"
-- docblock in `uploads.controller.ts`. The library only gives that upload a home
-- afterwards. The grant follows an existing grant one-for-one; it opens nothing
-- that was closed.
--
-- "ALREADY HAS THE PERMISSION" IS DEFINED HERE EXACTLY AS THE RUNTIME DEFINES
-- IT. `PermissionRepository.findGrantedByRole` reads
-- `WHERE role = ? AND allowed = true`, so a row with `allowed = false` — the
-- shape a DELIBERATE revocation takes, as opposed to "never configured" — is not
-- a grant, and this statement does not treat it as one. Getting that predicate
-- wrong in either direction is the whole risk of a backfill: looser, and a role
-- the owner explicitly stripped gets the keys back; stricter, and the operators
-- this migration exists for do not get them. `permission.catalog.spec.ts` pins
-- the source-key list and this predicate against the code.
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
-- ─────────────────────────────────────────────────────────────────────────────

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
    AND rp."permission" IN (
      'products:write',
      'categories:write',
      'brands:write',
      'banners:write',
      'blog:write'
    )
) AS eligible
CROSS JOIN (VALUES ('media:read'), ('media:write')) AS new_key("permission")
-- Idempotent, and it also means a role that somehow already holds one of the two
-- keys keeps whatever `allowed` value it has rather than being silently re-granted.
ON CONFLICT ("role", "permission") DO NOTHING;
