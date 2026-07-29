-- CreateEnum
CREATE TYPE "CatalogImportStatus" AS ENUM ('PARSED', 'APPLYING', 'APPLIED', 'FAILED', 'CANCELLED');

-- CreateTable
CREATE TABLE "catalog_import_runs" (
    "id" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "file_hash" TEXT NOT NULL,
    "stored_path" TEXT NOT NULL,
    "status" "CatalogImportStatus" NOT NULL DEFAULT 'PARSED',
    "total_rows" INTEGER NOT NULL,
    "create_count" INTEGER NOT NULL,
    "update_count" INTEGER NOT NULL,
    "missing_count" INTEGER NOT NULL,
    "error_count" INTEGER NOT NULL,
    "applied_rows" INTEGER NOT NULL DEFAULT 0,
    "plan" JSONB NOT NULL,
    "decisions" JSONB,
    "error" TEXT,
    "actor_id" TEXT,
    "actor_email" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "applied_at" TIMESTAMP(3),

    CONSTRAINT "catalog_import_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "catalog_import_items" (
    "source_sku" TEXT NOT NULL,
    "product_id" TEXT,
    "last_imported" JSONB NOT NULL,
    "source_image_urls" TEXT[],
    "missing_since_run_id" TEXT,
    "last_seen_run_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "catalog_import_items_pkey" PRIMARY KEY ("source_sku")
);

-- CreateIndex
CREATE INDEX "catalog_import_runs_status_created_at_idx" ON "catalog_import_runs"("status", "created_at");

-- CreateIndex
CREATE INDEX "catalog_import_runs_created_at_idx" ON "catalog_import_runs"("created_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "catalog_import_items_product_id_key" ON "catalog_import_items"("product_id");

-- CreateIndex
CREATE INDEX "catalog_import_items_last_seen_run_id_idx" ON "catalog_import_items"("last_seen_run_id");

-- AddForeignKey
ALTER TABLE "catalog_import_items" ADD CONSTRAINT "catalog_import_items_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE SET NULL ON UPDATE CASCADE;
