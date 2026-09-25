-- TASK-625: POST /orders/lookup — the one public, uncached route that reads the
-- primary database — matched the phone on columns with no index (a seq scan of
-- `orders` plus a scan/join of `users` on every request). The id half is served
-- by a range on the primary key (order-lookup.repository.ts), not by LIKE.

-- CreateIndex
CREATE INDEX "orders_guest_phone_idx" ON "orders"("guest_phone");

-- CreateIndex
CREATE INDEX "users_phone_idx" ON "users"("phone");
