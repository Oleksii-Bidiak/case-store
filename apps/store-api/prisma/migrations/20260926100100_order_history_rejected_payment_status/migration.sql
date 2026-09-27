-- TASK-621: what a refused provider event ASKED for. Kept in its own column
-- rather than in `to_payment_status`, which stays the literal truth
-- (`current → current`) so the history rows still read as a chain.
--
-- Additive and nullable, no backfill: rows written before this change never
-- recorded the requested status (it went to the log only). The admin timeline
-- reads such a legacy row — a PAYMENT_STATUS row with from = to and no note — as
-- a refusal too, without naming the target.

-- AlterTable
ALTER TABLE "order_status_history" ADD COLUMN     "rejected_payment_status" "PaymentStatus";
