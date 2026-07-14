-- DropIndex
DROP INDEX "product_images_product_id_idx";

-- AlterTable
ALTER TABLE "product_images" ADD COLUMN     "is_primary" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE INDEX "product_images_product_id_sort_order_idx" ON "product_images"("product_id", "sort_order");
