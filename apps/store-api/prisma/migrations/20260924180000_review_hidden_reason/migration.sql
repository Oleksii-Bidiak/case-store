-- TASK-599 + TASK-600 (+ the data half of TASK-603), plan 192 cluster A4.
--
-- `Review.hiddenAt` was written by two different decisions — a ban and a
-- moderator's account-wide hide — and an un-ban cleared both, so a moderator's
-- verdict on a spammer was undone by whoever switched the account back on.
-- `hidden_reason` records which decision is holding each row down.

-- CreateEnum
CREATE TYPE "ReviewHiddenReason" AS ENUM ('BAN', 'MODERATOR', 'DELETED');

-- AlterTable
ALTER TABLE "reviews" ADD COLUMN     "hidden_reason" "ReviewHiddenReason";

-- Backfill 1 (TASK-599, plan 192 «Ризики»): every row hidden before this column
-- existed becomes MODERATOR. Conservative on purpose — we cannot tell a ban from
-- a moderator's hide after the fact, and reading it as MODERATOR means an un-ban
-- can never resurrect something a moderator pulled. The cost is that an old ban
-- lifted later leaves its reviews hidden until a moderator restores them, which
-- is a click; the opposite mistake republishes spam silently.
--
-- Measured before deploy (2026-09-25): store_dev 0 of 2214 rows, store_test 0.
UPDATE "reviews"
SET "hidden_reason" = 'MODERATOR'
WHERE "hidden_at" IS NOT NULL;

-- Backfill 2 (TASK-603): a soft-deleted account's contribution was never
-- withdrawn — `deleteUser` did less than `deactivateUser`. Rows of accounts that
-- are ALREADY deleted are brought in line with what the code now does on delete:
-- hidden, reason DELETED (the strongest, so it also overrides the MODERATOR
-- written just above), and their stars out of every average. `hidden_at` keeps
-- its earlier value where there was one — "hidden when" is what an appeal asks.
--
-- Measured before deploy (2026-09-25): store_dev 0 rows, store_test 0.
UPDATE "reviews" AS r
SET "hidden_at" = COALESCE(r."hidden_at", u."deleted_at"),
    "hidden_reason" = 'DELETED',
    "rating_visible" = false
FROM "users" AS u
WHERE u."id" = r."user_id"
  AND u."deleted_at" IS NOT NULL;

-- The pair moves together or not at all. Prisma cannot express a CHECK, so this
-- lives only here; the repository writes both columns in every statement that
-- touches either, and this is what refuses a statement that forgets one.
ALTER TABLE "reviews"
  ADD CONSTRAINT "reviews_hidden_reason_matches_hidden_at"
  CHECK (("hidden_at" IS NULL) = ("hidden_reason" IS NULL));

-- CreateIndex (TASK-600): the rating-abuse burst query groups the last hour's
-- visible reviews by product; no existing index led with `created_at`.
CREATE INDEX "reviews_visible_created_at_product_idx" ON "reviews"("created_at", "product_id") WHERE ("hidden_at" IS NULL);
