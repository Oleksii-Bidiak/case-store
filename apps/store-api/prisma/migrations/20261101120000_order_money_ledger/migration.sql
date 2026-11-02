-- TASK-2047 / TASK-2046 / TASK-951 (R2 "payment from one place", B-12 theme 1;
-- docs/plans/178-brainstorms.md "Рішення (B-12)").
--
-- WHAT
--   - enums MoneyDirection, MoneyEntryKind, MoneyProviderState;
--   - PaymentMethod.BANK_TRANSFER, PaymentStatus.PARTIALLY_PAID,
--     OrderHistoryNote.LEGACY_MONEY_UNKNOWN / PROVIDER_REFUND_UNMATCHED;
--   - `order_money_entries` — the order's money ledger, both directions, integer
--     kopecks; order/return/payment FKs RESTRICT (money rows never vanish), actor
--     SET NULL, self-FK for reversals (unique: a row is reversed at most once);
--   - `orders` + paid_kop / refunded_kop / return_credit_kop / balance_kop;
--   - `returns` + credit_kop / credit_reason;
--   - `payment_events` + dedupe_key (default ''), added to the idempotency key so a
--     second partial `reversed` is no longer swallowed as a duplicate;
--   - hand-written CHECKs at the end of this file.
--
-- WHY
--   Money lived in four places that did not see each other (Return.refundedAmount,
--   Payment.refundedAmount, the amount-less paymentStatus label, the analytics
--   "remainder"), so two refund paths could pay out more than was paid (TASK-951).
--   One ledger per order; statuses and labels become derived from it.
--
-- The new enum values are NOT used here: Postgres refuses to use a value added by
-- `ALTER TYPE … ADD VALUE` in the transaction that added it. The backfill that
-- needs them is the next migration, 20261101130000_order_money_backfill.

-- CreateEnum
CREATE TYPE "MoneyDirection" AS ENUM ('IN', 'OUT');

-- CreateEnum
CREATE TYPE "MoneyEntryKind" AS ENUM ('LIQPAY_PAYMENT', 'COD_NOVA_POSHTA', 'PAID_AT_POINT', 'PAID_TO_COURIER', 'BANK_TRANSFER', 'LIQPAY_REFUND', 'CASH_REFUND', 'TRANSFER_REFUND');

-- CreateEnum
CREATE TYPE "MoneyProviderState" AS ENUM ('REQUESTED', 'CONFIRMED');

-- AlterEnum
ALTER TYPE "OrderHistoryNote" ADD VALUE 'LEGACY_MONEY_UNKNOWN';
ALTER TYPE "OrderHistoryNote" ADD VALUE 'PROVIDER_REFUND_UNMATCHED';

-- AlterEnum
ALTER TYPE "PaymentMethod" ADD VALUE 'BANK_TRANSFER';

-- AlterEnum
ALTER TYPE "PaymentStatus" ADD VALUE 'PARTIALLY_PAID';

-- DropIndex
DROP INDEX "payment_events_payment_id_provider_status_provider_payment__key";

-- AlterTable
ALTER TABLE "orders" ADD COLUMN     "balance_kop" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "paid_kop" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "refunded_kop" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "return_credit_kop" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "payment_events" ADD COLUMN     "dedupe_key" TEXT NOT NULL DEFAULT '';

-- AlterTable
ALTER TABLE "returns" ADD COLUMN     "credit_kop" INTEGER,
ADD COLUMN     "credit_reason" TEXT;

-- CreateTable
CREATE TABLE "order_money_entries" (
    "id" TEXT NOT NULL,
    "order_id" TEXT NOT NULL,
    "direction" "MoneyDirection" NOT NULL,
    "kind" "MoneyEntryKind" NOT NULL,
    "amount_kop" INTEGER NOT NULL,
    "return_id" TEXT,
    "payment_id" TEXT,
    "provider_ref" TEXT,
    "provider_state" "MoneyProviderState",
    "actor_id" TEXT,
    "reason" TEXT,
    "reversal_of_id" TEXT,
    "voided_at" TIMESTAMP(3),
    "void_reason" TEXT,
    "legacy" BOOLEAN NOT NULL DEFAULT false,
    "occurred_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "order_money_entries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "order_money_entries_reversal_of_id_key" ON "order_money_entries"("reversal_of_id");

-- CreateIndex
CREATE INDEX "order_money_entries_order_id_created_at_idx" ON "order_money_entries"("order_id", "created_at");

-- CreateIndex
CREATE INDEX "order_money_entries_return_id_idx" ON "order_money_entries"("return_id");

-- CreateIndex
CREATE UNIQUE INDEX "order_money_entries_payment_id_provider_ref_key" ON "order_money_entries"("payment_id", "provider_ref");

-- CreateIndex
CREATE UNIQUE INDEX "payment_events_payment_id_provider_status_provider_payment__key" ON "payment_events"("payment_id", "provider_status", "provider_payment_id", "dedupe_key");

-- AddForeignKey
ALTER TABLE "order_money_entries" ADD CONSTRAINT "order_money_entries_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_money_entries" ADD CONSTRAINT "order_money_entries_return_id_fkey" FOREIGN KEY ("return_id") REFERENCES "returns"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_money_entries" ADD CONSTRAINT "order_money_entries_payment_id_fkey" FOREIGN KEY ("payment_id") REFERENCES "payments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_money_entries" ADD CONSTRAINT "order_money_entries_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_money_entries" ADD CONSTRAINT "order_money_entries_reversal_of_id_fkey" FOREIGN KEY ("reversal_of_id") REFERENCES "order_money_entries"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Hand-written CHECKs (Prisma cannot express them). The ledger is unsigned: the
-- direction carries the sign, so a zero or negative amount is always a bug.
ALTER TABLE "order_money_entries" ADD CONSTRAINT "order_money_entries_amount_kop_positive" CHECK ("amount_kop" > 0);

-- Never more out than in (TASK-951) — the last line of defence behind the
-- ceiling check the repository runs under the order-row lock.
ALTER TABLE "orders" ADD CONSTRAINT "orders_paid_kop_non_negative" CHECK ("paid_kop" >= 0);
ALTER TABLE "orders" ADD CONSTRAINT "orders_refunded_kop_non_negative" CHECK ("refunded_kop" >= 0);
ALTER TABLE "orders" ADD CONSTRAINT "orders_refunded_kop_within_paid" CHECK ("refunded_kop" <= "paid_kop");
