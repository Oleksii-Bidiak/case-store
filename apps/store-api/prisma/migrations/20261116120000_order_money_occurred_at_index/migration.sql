-- TASK-2395 «Рух коштів»: the money flow report and its register range-scan the
-- whole order money ledger by `occurred_at` (when the money moved), across every
-- order. The existing (order_id, created_at) index cannot serve that predicate,
-- so without this every report load is a sequential scan of the ledger.

-- CreateIndex
CREATE INDEX "order_money_entries_occurred_at_idx" ON "order_money_entries"("occurred_at");
