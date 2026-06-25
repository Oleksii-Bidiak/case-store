-- TASK-142-A: variant-as-product-position model.
-- Promote each ProductVariant to a first-class Product position; group sibling
-- positions via ProductGroup + ProductGroupAxis; drop ProductVariant and the
-- variant_id columns on cart/order items. No data backfill (pre-MVP, seed is
-- rewritten in TASK-142-G).

-- DropForeignKey
ALTER TABLE "cart_items" DROP CONSTRAINT "cart_items_variant_id_fkey";

-- DropForeignKey
ALTER TABLE "order_items" DROP CONSTRAINT "order_items_variant_id_fkey";

-- DropForeignKey
ALTER TABLE "product_variants" DROP CONSTRAINT "product_variants_product_id_fkey";

-- DropIndex
DROP INDEX "cart_items_cart_id_product_id_variant_id_key";

-- AlterTable
ALTER TABLE "cart_items" DROP COLUMN "variant_id";

-- AlterTable
ALTER TABLE "order_items" DROP COLUMN "variant_id";

-- AlterTable
ALTER TABLE "products" ADD COLUMN     "attributes" JSONB DEFAULT '{}',
ADD COLUMN     "group_id" TEXT,
ADD COLUMN     "position_order" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "stock" INTEGER NOT NULL DEFAULT 0;

-- DropTable
DROP TABLE "product_variants";

-- CreateTable
CREATE TABLE "product_groups" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "product_groups_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_group_axes" (
    "id" TEXT NOT NULL,
    "group_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "product_group_axes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "product_group_axes_group_id_idx" ON "product_group_axes"("group_id");

-- CreateIndex
CREATE UNIQUE INDEX "cart_items_cart_id_product_id_key" ON "cart_items"("cart_id", "product_id");

-- CreateIndex
CREATE INDEX "products_group_id_idx" ON "products"("group_id");

-- AddForeignKey
ALTER TABLE "products" ADD CONSTRAINT "products_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "product_groups"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_group_axes" ADD CONSTRAINT "product_group_axes_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "product_groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Re-apply the non-negative stock guard on the new per-position `stock` column.
-- The equivalent CHECK lived on product_variants.stock (migration
-- 20260612120000), which is dropped with that table here.
ALTER TABLE "products" ADD CONSTRAINT "products_stock_non_negative" CHECK ("stock" >= 0);
