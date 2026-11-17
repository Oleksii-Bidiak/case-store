-- TASK-2048: the part of refunded_kop that moved to a copy as «Залік», so a
-- cancelled original whose money went to its copy is not read as refunded.

-- AlterTable
ALTER TABLE "orders" ADD COLUMN     "offset_out_kop" INTEGER NOT NULL DEFAULT 0;

-- Backfill from the ledger: OFFSET_TO_ORDER rows, net of reversals, voided ones not counted.
UPDATE "orders" o
SET "offset_out_kop" = s.kop
FROM (
  SELECT e."order_id",
         SUM(CASE WHEN e."reversal_of_id" IS NULL THEN e."amount_kop" ELSE -e."amount_kop" END)::INTEGER AS kop
  FROM "order_money_entries" e
  WHERE e."kind" = 'OFFSET_TO_ORDER' AND e."voided_at" IS NULL
  GROUP BY e."order_id"
) s
WHERE o."id" = s."order_id";

ALTER TABLE "orders" ADD CONSTRAINT "orders_offset_out_kop_check"
  CHECK ("offset_out_kop" >= 0 AND "offset_out_kop" <= "refunded_kop");
