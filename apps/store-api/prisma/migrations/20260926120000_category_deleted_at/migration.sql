-- TASK-651 (plan 185, decision B-2): audit tombstone for categories.
--
-- `deleted_at` is set once by `DELETE /admin/categories/:id`, which tombstones a
-- whole subtree after moving every product out of it; it is never cleared.
-- NO BACKFILL: no category is deleted today, so every existing row stays NULL
-- (live). The index serves the `deleted_at IS NULL` filter every read path adds.

-- AlterTable
ALTER TABLE "categories" ADD COLUMN     "deleted_at" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "categories_deleted_at_idx" ON "categories"("deleted_at");
