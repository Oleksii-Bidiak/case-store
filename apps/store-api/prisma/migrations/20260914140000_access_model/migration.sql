-- AlterTable
ALTER TABLE "users" ADD COLUMN     "is_owner" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "user_permissions" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "permission" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_permissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "permission_templates" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "permission_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "permission_template_items" (
    "id" TEXT NOT NULL,
    "template_id" TEXT NOT NULL,
    "permission" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "permission_template_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "user_permissions_user_id_idx" ON "user_permissions"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "user_permissions_user_id_permission_key" ON "user_permissions"("user_id", "permission");

-- CreateIndex
CREATE UNIQUE INDEX "permission_templates_name_key" ON "permission_templates"("name");

-- CreateIndex
CREATE UNIQUE INDEX "permission_template_items_template_id_permission_key" ON "permission_template_items"("template_id", "permission");

-- CreateIndex
CREATE UNIQUE INDEX "users_single_owner_key" ON "users"("is_owner") WHERE ("is_owner" = true);

-- AddForeignKey
ALTER TABLE "user_permissions" ADD CONSTRAINT "user_permissions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "permission_template_items" ADD CONSTRAINT "permission_template_items_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "permission_templates"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ─────────────────────────────────────────────────────────────────────────────
-- Backfill: give the shop an owner, and move every live manager's permissions
-- from their ROLE onto them personally (TASK-474, plan 181).
--
-- WHY THIS MIGRATION CARRIES DATA AT ALL. The new tables are read by nobody yet
-- — that is deliberate, TASK-474 changes no behaviour — but the very next task
-- switches `PermissionGuard` from `role_permissions` to `user_permissions`. If
-- the rows are not already there when that lands, every manager in the shop
-- signs in the next morning to an admin panel where nothing works, with no
-- error anyone can act on: a permission that is merely absent is indistinguishable
-- from one that was never granted. The data has to move in the same commit that
-- creates the place for it to live.
--
-- WHAT "THE SAME SET" MEANS, EXACTLY. `PermissionRepository.findGrantedByRole`
-- reads `WHERE role = ? AND allowed = true`, so `allowed = false` — the shape a
-- DELIBERATE revocation takes, as opposed to "never configured" — is not a grant
-- and is not copied. Both directions of getting this predicate wrong are bad and
-- silent: looser, and a key the owner explicitly took away comes back; stricter,
-- and an operator loses access mid-shift. `permission.catalog.spec.ts` pins this
-- statement against that repository method, and
-- `test/access-model-backfill.int-spec.ts` SLICES the block below out of this file
-- by its `-- backfill:*` markers and executes it against a real Postgres, with
-- `role_permissions` recreated as a TEMP table to stand in for the shop's old
-- data. Only the source table is a fixture; every predicate — the role, the
-- `allowed = true`, the liveness flag — is the one that ships here. The markers
-- are therefore load-bearing: renaming one does not break the build, it removes
-- the only executable proof of invariant 6.
--
-- WHY THE OWNER IS THE OLDEST ADMIN, AND WHY A DEACTIVATED ONE STILL COUNTS.
-- There is no column that records who founded the shop, so the migration has to
-- choose, and every choice here is a guess. The oldest surviving ADMIN account is
-- the least wrong one available: the shop's first admin is the one that existed
-- before anybody was hired.
--
-- An ACTIVE admin is preferred — that is what the `ORDER BY is_active DESC` is
-- for — but a deactivated one is still eligible, and that is the whole point of
-- the ordering rather than a filter. Requiring `is_active = true` here meant that
-- a database whose only admin was switched off got `WHERE "id" = NULL`, matched
-- nothing, and COMMITTED: `migrate deploy` exits 0, `_prisma_migrations` records
-- the migration as applied, and it never runs again. The shop then has no owner
-- and no way to acquire one, because the only `isOwner` write in the entire API
-- is the ownership transfer and that is `@OwnerOnly`. Handing the flag to an
-- account somebody must re-activate first is strictly better: re-activation is a
-- route that EXISTS, and appointing an owner is not.
--
-- Tombstones (`deleted_at IS NOT NULL`) stay excluded. A soft-deleted account has
-- a mangled email, cannot sign in, and is never coming back by design — that is
-- the difference between the reversible toggle and the audit tombstone.
--
-- A shop with no ADMIN row at all still ends up with no owner, and that is
-- correct: there is nobody to promote. `prisma/seed/seeders/users.seeder.ts` and
-- `src/scripts/create-admin.ts` both claim ownership when nobody holds it, which
-- is what covers a fresh install and a break-glass recovery respectively.
--
-- IDEMPOTENT THROUGHOUT. Every statement can run twice with no second effect —
-- `NOT EXISTS` on the owner, `ON CONFLICT DO NOTHING` on each insert. That is not
-- housekeeping: the integration spec re-runs this block to prove it, and a
-- re-runnable backfill is what makes a restore-then-migrate recovery safe.
-- ─────────────────────────────────────────────────────────────────────────────

-- backfill:start

-- backfill:owner:start
UPDATE "users"
SET "is_owner" = true
WHERE "id" = (
    SELECT candidate."id"
    FROM "users" candidate
    WHERE candidate."role" = 'ADMIN'
      AND candidate."deleted_at" IS NULL
    -- Active first, then oldest. A PREFERENCE, not a filter: see the note above
    -- on why a deactivated admin must still be eligible.
    ORDER BY candidate."is_active" DESC, candidate."created_at" ASC
    LIMIT 1
  )
  -- Both the re-run guard and the invariant itself: with an owner already in
  -- place this statement is a no-op rather than a unique-index violation.
  AND NOT EXISTS (SELECT 1 FROM "users" existing WHERE existing."is_owner" = true);
-- backfill:owner:end

-- backfill:manager-permissions:start
-- EVERY MANAGER THAT IS NOT A TOMBSTONE, deactivated ones included.
--
-- `deleted_at IS NULL` is the only liveness test here, and the asymmetry with
-- `is_active` is deliberate. The two flags mean different things in this schema:
-- `deleted_at` is an audit tombstone that is set once and never cleared, while
-- `is_active` is a reversible visibility toggle the owner flips for somebody on
-- leave and flips back when they return.
--
-- This filtered on `is_active = true` at first, reasoning that rows granted to a
-- switched-off account would be invisible until somebody re-enabled it, at which
-- point it would come back fully armed with nobody having decided that. That
-- reasoning does not survive contact with the code this same wave ships:
-- `StaffService.setStatus(false)` does NOT delete anybody's rows, so from this
-- release onward "switched off" ALWAYS keeps its permissions and always comes
-- back with them. A migration that made the opposite choice was not being
-- careful, it was being inconsistent with the only behaviour the shop actually
-- has — and the sibling migration in this very wave
-- (`20260915120000_backfill_customers_card_permission`) argues the other way
-- explicitly, because skipping a copy quietly NARROWS somebody on re-activation.
--
-- And the loss was unrecoverable rather than merely wrong. `role_permissions` is
-- dropped by the very next migration, so a manager skipped here has no source
-- left to restore from: they come back to an empty menu, with the shape of their
-- old job surviving only in a template somebody has to know to re-apply.
--
-- Demotion is where rights are dropped, and it drops them explicitly — see the
-- clear in `StaffService.updateRole`. Leaving the staff is a decision; being on
-- leave is not.
INSERT INTO "user_permissions" ("id", "user_id", "permission", "created_at", "updated_at")
SELECT
  gen_random_uuid()::text,
  staff."id",
  granted."permission",
  now(),
  now()
FROM "users" staff
CROSS JOIN "role_permissions" granted
WHERE staff."role" = 'MANAGER'
  AND staff."deleted_at" IS NULL
  AND granted."role" = 'MANAGER'
  AND granted."allowed" = true
ON CONFLICT ("user_id", "permission") DO NOTHING;

-- The same set, kept under a name. Once rights are per-person, nothing else
-- remembers what "a manager" meant in this shop, and the next hire would have to
-- be assembled tick by tick from memory. An ordinary editable template, with no
-- special status: applying one COPIES its rows onto a person, so editing or
-- deleting it later changes nobody's access.
INSERT INTO "permission_templates" ("id", "name", "description", "created_at", "updated_at")
VALUES (
  gen_random_uuid()::text,
  'Менеджер (як було)',
  'Набір прав, який роль «Менеджер» мала до переходу на права для людини.',
  now(),
  now()
)
ON CONFLICT ("name") DO NOTHING;

INSERT INTO "permission_template_items" ("id", "template_id", "permission", "created_at")
SELECT
  gen_random_uuid()::text,
  template."id",
  granted."permission",
  now()
FROM "permission_templates" template
CROSS JOIN "role_permissions" granted
WHERE template."name" = 'Менеджер (як було)'
  AND granted."role" = 'MANAGER'
  AND granted."allowed" = true
ON CONFLICT ("template_id", "permission") DO NOTHING;
-- backfill:manager-permissions:end

-- backfill:end
