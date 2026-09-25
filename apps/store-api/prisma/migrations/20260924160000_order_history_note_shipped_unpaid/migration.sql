-- TASK-788 (absorbs TASK-932): «відправлено без підтвердженої оплати».
-- Shipping an ONLINE-paid order whose payment is still PENDING/FAILED is allowed
-- (decision B-1), but it used to leave no trace; the STATUS history row of such
-- a move now carries this note.
--
-- Additive only, no backfill: past shipments cannot be told apart after the fact
-- (the payment status at the moment of shipping was never recorded).

-- AlterEnum
ALTER TYPE "OrderHistoryNote" ADD VALUE 'SHIPPED_UNPAID';
