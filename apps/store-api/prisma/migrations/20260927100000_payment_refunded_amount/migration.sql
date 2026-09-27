-- TASK-1302: running total of refunds requested on a payment attempt.
--
-- A partial refund leaves the attempt SUCCEEDED (so the rest can be refunded),
-- and until now the only ceiling was the amount charged — 600 + 500 out of 1000
-- both passed. PaymentService now reserves each refund against
-- `amount - refunded_amount` in one conditional UPDATE before calling the
-- provider, and gives it back if the provider refuses.
--
-- Existing rows start at 0: no refund has ever been made through the admin
-- (the button ships in the same wave), so there is nothing to backfill.

-- AlterTable
ALTER TABLE "payments" ADD COLUMN     "refunded_amount" DECIMAL(10,2) NOT NULL DEFAULT 0;
