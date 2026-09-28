-- TASK-642 (plan 184, B-6 decision of 2026-09-15): delivery methods.
--
-- Generated with `prisma migrate diff --from-schema <develop> --to-schema <this> --script`
-- (`migrate dev` does not run non-interactively here — see plan 181), then the
-- backfill below was added by hand.
--
-- `delivery_method` is added NOT NULL DEFAULT 'NOVA_POSHTA', so every existing order
-- starts as Nova Poshta; the UPDATE then marks OTHER every order whose address never
-- carried an NP city ref. Those were free-text addresses whose shipping NP never
-- priced — the silent 0.00 the method OTHER now names honestly. Not NOVA_POSHTA for
-- all (as `payment_method` was): that would invent history.
--
-- An empty string, a JSON null, a missing key and a NULL `shipping_address` all mean
-- "no ref" — hence COALESCE(…, ''). The invariant after this runs, checked by
-- test/delivery-method-backfill.int-spec.ts and by the two queries in
-- docs/qa-recheck.md SYS-42:
--   npCityRef present  ⇔  delivery_method <> 'OTHER'
--
-- Measured before deploy (2026-09-26):
--   store_dev as is: 12 orders, 0 with an npCityRef → all 12 become OTHER.
--   A copy of store_dev with refs planted to exercise both arms (4 real refs, one
--   '' and one JSON null): before 4 with ref / 8 without; after NOVA_POSHTA 4,
--   OTHER 8; "ref but OTHER" 0, "no ref but not OTHER" 0.
--   An empty database: applies cleanly, and the migrated schema has no drift
--   against schema.prisma.

-- CreateEnum
CREATE TYPE "DeliveryMethod" AS ENUM ('NOVA_POSHTA', 'PICKUP', 'COURIER', 'OTHER');

-- AlterTable
ALTER TABLE "orders" ADD COLUMN     "delivery_method" "DeliveryMethod" NOT NULL DEFAULT 'NOVA_POSHTA',
ADD COLUMN     "pickup_point_id" TEXT;

-- AlterTable
ALTER TABLE "delivery_settings" ADD COLUMN     "courier_city_name" TEXT,
ADD COLUMN     "courier_enabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "courier_free_from" DECIMAL(10,2),
ADD COLUMN     "courier_price" DECIMAL(10,2) NOT NULL DEFAULT 0,
ADD COLUMN     "np_enabled" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "other_enabled" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "pickup_enabled" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "pickup_points" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "phone" TEXT,
    "working_hours" TEXT,
    "map_url" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pickup_points_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "pickup_points_is_active_sort_order_idx" ON "pickup_points"("is_active", "sort_order");

-- CreateIndex
CREATE INDEX "orders_delivery_method_idx" ON "orders"("delivery_method");

-- CreateIndex
CREATE INDEX "orders_pickup_point_id_idx" ON "orders"("pickup_point_id");

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_pickup_point_id_fkey" FOREIGN KEY ("pickup_point_id") REFERENCES "pickup_points"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Backfill (hand-written)
UPDATE "orders" SET "delivery_method" = 'OTHER'
WHERE COALESCE("shipping_address"->>'npCityRef', '') = '';
