-- TASK-621: «подію оплати відхилено». A provider event asking for a payment move
-- the state machine (or the B-1 cross-rule) refuses used to leave a history row
-- reading `Оплачено → Оплачено` — nothing on it said an event arrived, what it
-- asked for, or that it was refused. The row now carries this note.
--
-- On its own in this migration: a value added by ALTER TYPE … ADD VALUE cannot
-- be used in the same transaction, and the column that accompanies it lives in
-- the next migration.

-- AlterEnum
ALTER TYPE "OrderHistoryNote" ADD VALUE 'PAYMENT_EVENT_REFUSED';
