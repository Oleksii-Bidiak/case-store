-- TASK-2048 «Створити копію»: the copy link, the «Залік» money kinds and their
-- counterpart order, and the two history notes.

-- AlterEnum
ALTER TYPE "MoneyEntryKind" ADD VALUE 'OFFSET_TO_ORDER';
ALTER TYPE "MoneyEntryKind" ADD VALUE 'OFFSET_FROM_ORDER';

-- AlterEnum
ALTER TYPE "OrderHistoryNote" ADD VALUE 'COPIED_TO_ORDER';
ALTER TYPE "OrderHistoryNote" ADD VALUE 'COPY_OF_ORDER';

-- AlterTable
ALTER TABLE "order_money_entries" ADD COLUMN     "counterpart_order_id" TEXT;

-- AlterTable
ALTER TABLE "orders" ADD COLUMN     "copied_from_id" TEXT;

-- CreateIndex
CREATE INDEX "orders_copied_from_id_idx" ON "orders"("copied_from_id");

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_copied_from_id_fkey" FOREIGN KEY ("copied_from_id") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_money_entries" ADD CONSTRAINT "order_money_entries_counterpart_order_id_fkey" FOREIGN KEY ("counterpart_order_id") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
