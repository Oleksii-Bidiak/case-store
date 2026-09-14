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
-- `test/access-model-backfill.int-spec.ts` executes the block below against a
-- real Postgres and asserts the resulting set row for row.
--
-- WHY THE OWNER IS THE OLDEST LIVE ADMIN. There is no column that records who
-- founded the shop, so the migration has to choose, and every choice here is a
-- guess. The oldest surviving ADMIN account is the least wrong one available: the
-- shop's first admin is the one that existed before anybody was hired. Deactivated
-- and tombstoned accounts are excluded because handing ownership to an account
-- nobody can sign into produces a shop whose owner-only actions are unreachable.
-- The owner can be transferred afterwards (TASK-478); it cannot be left unset,
-- which is why this runs now rather than being left to a human to remember.
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
      AND candidate."is_active" = true
      AND candidate."deleted_at" IS NULL
    ORDER BY candidate."created_at" ASC
    LIMIT 1
  )
  -- Both the re-run guard and the invariant itself: with an owner already in
  -- place this statement is a no-op rather than a unique-index violation.
  AND NOT EXISTS (SELECT 1 FROM "users" existing WHERE existing."is_owner" = true);
-- backfill:owner:end

-- backfill:manager-permissions:start
-- Only LIVE staff. A deactivated or tombstoned account must come out of this
-- holding nothing: rows granted to a switched-off account are invisible until
-- somebody switches it back on to "check something", at which point it is fully
-- armed and nobody decided that.
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
  AND staff."is_active" = true
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
