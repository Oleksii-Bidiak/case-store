-- ─────────────────────────────────────────────────────────────────────────────
-- A flag on an order-history row for an event the shop recorded but did not act
-- on (TASK-619, owner decision B-11 №3 in plan 178).
--
-- THE DEFECT. A LiqPay `success` that lands after the reservation TTL cancelled
-- the order used to move it CANCELLED → CONFIRMED without re-reserving stock and
-- without clearing `restocked_at`: a paid, confirmed order with nothing held for
-- it, whose units could be sold a second time. The fix records the money (PAID)
-- and leaves the order CANCELLED; the payment's history row carries
-- `note = 'PAID_AFTER_CANCEL'` («оплачено після скасування») so the operator's
-- «Потребує дії» list can find it and decide — revive (re-reserves) or refund.
--
-- Additive only: a new enum and a nullable column; existing rows stay NULL. No
-- backfill: an order the old code revived this way is no longer CANCELLED, so
-- the note («still cancelled, decide») would not describe it.
-- ─────────────────────────────────────────────────────────────────────────────

-- CreateEnum
CREATE TYPE "OrderHistoryNote" AS ENUM ('PAID_AFTER_CANCEL');

-- AlterTable
ALTER TABLE "order_status_history" ADD COLUMN     "note" "OrderHistoryNote";
