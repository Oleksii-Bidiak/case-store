-- TASK-1961 / TASK-2044 / TASK-1963 / TASK-2045 (R1, B-12 §1 "one request — different
-- decisions"; docs/plans/178-brainstorms.md "Рішення (B-12)").
--
-- WHAT
--   - enums ReturnOutcome, ReturnDecision, ReturnChannel, ReturnRepairStep, RepairResult;
--   - `returns` + requested_outcome, channel (default ACCOUNT), decision, decision_reason,
--     decided_at, decided_by_id (FK users, SET NULL), decision_legacy (default false);
--   - `return_decision_events` (decision history) and `return_repair_events` (repair
--     steps), both cascading with their return, actor SET NULL;
--   - a hand-written backfill between the BACKFILL markers at the end of this file.
--
-- WHY
--   Until B-12 a return had a status and nothing else: no decision the customer could
--   read, no reason, no author, and no way to promise a replacement or a repair. The
--   status keeps saying where the goods and the money are; the decision says what was
--   promised, and its history says who changed it and why.
--
-- BACKFILL (only the new columns/table are written — status, money, dates and
-- operator_notes are not touched, and `updated_at` is not bumped):
--   - channel = OPERATOR when created_by_user_id is set and differs from the order's
--     user_id (a guest order has no user, so any opener differs), ACCOUNT otherwise;
--   - APPROVED / RECEIVED / REFUNDED -> decision REFUND, decided_at = resolved_at,
--     decision_legacy = true (refund was the only positive outcome before B-12);
--   - REJECTED -> decision REJECT, decision_reason NULL (none was ever asked for),
--     decided_at = resolved_at, decision_legacy = true;
--   - one legacy decision event per decided row (actor NULL, reason NULL,
--     created_at = coalesce(resolved_at, requested_at));
--   - REQUESTED rows are untouched.
--   Every statement is guarded so a replay changes nothing (pinned by
--   test/return-backfill.int-spec.ts, which executes the marked section as shipped).
--
-- COUNTS (store_dev, 2026-10-31)
--   before: returns 0 (no rows in any status), sum(refunded_amount) 0,
--           count(restocked_at) 0, non-REQUESTED 0;
--   after:  returns 0, sum(refunded_amount) 0, count(restocked_at) 0, no decision /
--           channel rows, return_decision_events 0 (= non-REQUESTED 0).
--   On the demo stand the success condition is the same: decision events =
--   non-REQUESTED returns; counts by status, sum(refunded_amount) and
--   count(restocked_at) unchanged.

-- CreateEnum
CREATE TYPE "ReturnOutcome" AS ENUM ('REFUND', 'REPLACEMENT', 'REPAIR');

-- CreateEnum
CREATE TYPE "ReturnDecision" AS ENUM ('REFUND', 'REPLACEMENT', 'REPAIR', 'REJECT');

-- CreateEnum
CREATE TYPE "ReturnChannel" AS ENUM ('ACCOUNT', 'GUEST_LINK', 'OPERATOR');

-- CreateEnum
CREATE TYPE "ReturnRepairStep" AS ENUM ('ACCEPTED', 'SENT_TO_SERVICE', 'RETURNED_FROM_SERVICE', 'HANDED_TO_CUSTOMER');

-- CreateEnum
CREATE TYPE "RepairResult" AS ENUM ('REPAIRED', 'UNREPAIRABLE');

-- AlterTable
ALTER TABLE "returns" ADD COLUMN     "channel" "ReturnChannel" NOT NULL DEFAULT 'ACCOUNT',
ADD COLUMN     "decided_at" TIMESTAMP(3),
ADD COLUMN     "decided_by_id" TEXT,
ADD COLUMN     "decision" "ReturnDecision",
ADD COLUMN     "decision_legacy" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "decision_reason" TEXT,
ADD COLUMN     "requested_outcome" "ReturnOutcome";

-- CreateTable
CREATE TABLE "return_decision_events" (
    "id" TEXT NOT NULL,
    "return_id" TEXT NOT NULL,
    "decision" "ReturnDecision" NOT NULL,
    "reason" TEXT,
    "actor_id" TEXT,
    "legacy" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "return_decision_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "return_repair_events" (
    "id" TEXT NOT NULL,
    "return_id" TEXT NOT NULL,
    "step" "ReturnRepairStep" NOT NULL,
    "result" "RepairResult",
    "destination" TEXT,
    "ttn" TEXT,
    "note" TEXT,
    "actor_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "return_repair_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "return_decision_events_return_id_idx" ON "return_decision_events"("return_id");

-- CreateIndex
CREATE INDEX "return_repair_events_return_id_idx" ON "return_repair_events"("return_id");

-- AddForeignKey
ALTER TABLE "returns" ADD CONSTRAINT "returns_decided_by_id_fkey" FOREIGN KEY ("decided_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "return_decision_events" ADD CONSTRAINT "return_decision_events_return_id_fkey" FOREIGN KEY ("return_id") REFERENCES "returns"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "return_decision_events" ADD CONSTRAINT "return_decision_events_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "return_repair_events" ADD CONSTRAINT "return_repair_events_return_id_fkey" FOREIGN KEY ("return_id") REFERENCES "returns"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "return_repair_events" ADD CONSTRAINT "return_repair_events_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- BACKFILL:BEGIN
-- Hand-written. Each statement only writes rows still at the column defaults, so a
-- restore-then-migrate replay is a no-op.

-- Channel: an opener other than the order's owner is the shop filing on the
-- customer's behalf. A NULL opener (rows predating TASK-469) stays ACCOUNT.
UPDATE "returns" AS r
SET "channel" = 'OPERATOR'
FROM "orders" AS o
WHERE o."id" = r."order_id"
  AND r."channel" = 'ACCOUNT'
  AND r."created_by_user_id" IS NOT NULL
  AND r."created_by_user_id" IS DISTINCT FROM o."user_id";

-- Pre-B-12 approvals could only mean "money back".
UPDATE "returns"
SET "decision" = 'REFUND',
    "decided_at" = "resolved_at",
    "decision_legacy" = true
WHERE "decision" IS NULL
  AND "status" IN ('APPROVED', 'RECEIVED', 'REFUNDED');

-- Pre-B-12 rejections: no reason was ever asked for, so none is invented.
UPDATE "returns"
SET "decision" = 'REJECT',
    "decision_reason" = NULL,
    "decided_at" = "resolved_at",
    "decision_legacy" = true
WHERE "decision" IS NULL
  AND "status" = 'REJECTED';

-- One legacy history row per legacy decision, unless it already has one.
INSERT INTO "return_decision_events" ("id", "return_id", "decision", "reason", "actor_id", "legacy", "created_at")
SELECT gen_random_uuid()::text, r."id", r."decision", NULL, NULL, true,
       COALESCE(r."resolved_at", r."requested_at")
FROM "returns" AS r
WHERE r."decision_legacy" = true
  AND r."decision" IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM "return_decision_events" AS e WHERE e."return_id" = r."id"
  );
-- BACKFILL:END

