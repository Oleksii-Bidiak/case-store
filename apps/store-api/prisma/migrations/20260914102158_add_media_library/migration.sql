-- AlterTable
ALTER TABLE "product_images" ADD COLUMN     "media_asset_id" TEXT;

-- CreateTable
CREATE TABLE "media_assets" (
    "id" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "blur_data_url" TEXT,
    "width" INTEGER NOT NULL DEFAULT 0,
    "height" INTEGER NOT NULL DEFAULT 0,
    "bytes" INTEGER NOT NULL DEFAULT 0,
    "mime" TEXT NOT NULL,
    "alt" TEXT,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "uploaded_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "media_assets_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "media_assets_url_key" ON "media_assets"("url");

-- CreateIndex
CREATE INDEX "media_assets_tags_idx" ON "media_assets" USING GIN ("tags");

-- CreateIndex
CREATE INDEX "media_assets_created_at_idx" ON "media_assets"("created_at");

-- CreateIndex
CREATE INDEX "product_images_media_asset_id_idx" ON "product_images"("media_asset_id");

-- AddForeignKey
ALTER TABLE "product_images" ADD CONSTRAINT "product_images_media_asset_id_fkey" FOREIGN KEY ("media_asset_id") REFERENCES "media_assets"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "media_assets" ADD CONSTRAINT "media_assets_uploaded_by_id_fkey" FOREIGN KEY ("uploaded_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ─────────────────────────────────────────────────────────────────────────────
-- Backfill: every image already attached to a product becomes a library asset
-- (TASK-441, plan 177).
--
-- NO FILE IS MOVED, COPIED OR OPENED. The rows below point at exactly the URLs
-- `product_images` already holds, so `/uploads/products/<uuid>.webp` keeps
-- serving the same bytes from the same path. A migration that reorganised the
-- on-disk layout would break every URL already in a browser cache, in the
-- sitemap and in the Open Graph card of every shared link — for no gain, since
-- the library addresses assets by URL either way.
--
-- WIDTH / HEIGHT / BYTES ARE LEFT AT 0, WHICH MEANS "UNKNOWN". Those three
-- numbers exist only inside the image files themselves; SQL cannot read them,
-- and the files live on the API host's disk, not in the database. The honest
-- options were a zero or an invention, and an invented 1920x1080 would look
-- exactly like a measured one to every screen that shows it. New uploads through
-- the library carry the real numbers (`ImageProcessor.process` returns them).
--
-- ONE ASSET PER DISTINCT URL. `product_images` legitimately repeats a URL across
-- positions of one product group (the seeded catalogue alone has 381 rows over
-- 125 distinct URLs), and `media_assets.url` is UNIQUE because usage is matched
-- on it. `DISTINCT ON` picks the most complete of the duplicates: one that has an
-- LQIP first, then one that has alt text, then the oldest.
-- ─────────────────────────────────────────────────────────────────────────────

INSERT INTO "media_assets" (
  "id", "url", "blur_data_url", "width", "height", "bytes", "mime",
  "alt", "tags", "uploaded_by_id", "created_at", "updated_at"
)
SELECT
  gen_random_uuid()::text,
  src."url",
  src."blur_data_url",
  0,
  0,
  0,
  -- Derived from the stored file's own extension, which our storage layer
  -- controls (`<uuid>.<ext>`, where ext comes from the DECODED format — see
  -- LocalDiskStorageService). Not a guess about the content: an unrecognised
  -- extension yields `application/octet-stream` rather than a plausible lie.
  CASE
    WHEN lower(src."url") LIKE '%.webp' THEN 'image/webp'
    WHEN lower(src."url") LIKE '%.gif'  THEN 'image/gif'
    WHEN lower(src."url") LIKE '%.png'  THEN 'image/png'
    WHEN lower(src."url") LIKE '%.jpg'  THEN 'image/jpeg'
    WHEN lower(src."url") LIKE '%.jpeg' THEN 'image/jpeg'
    ELSE 'application/octet-stream'
  END,
  src."alt",
  ARRAY[]::TEXT[],
  -- No uploader: nobody uploaded these THROUGH the library, and naming an
  -- arbitrary admin would put a fabricated fact in an audit-adjacent column.
  NULL,
  src."created_at",
  now()
FROM (
  SELECT DISTINCT ON (pi."url")
         pi."url",
         pi."blur_data_url",
         pi."alt",
         pi."created_at"
  FROM "product_images" pi
  ORDER BY pi."url",
           (pi."blur_data_url" IS NULL),  -- FALSE sorts first, so a row WITH an LQIP wins
           (pi."alt" IS NULL),            -- then a row that has alt text
           pi."created_at" ASC
) AS src
-- Idempotent: re-running this against a database that already holds the rows
-- changes nothing, and in particular must not overwrite alt text an operator has
-- edited since.
ON CONFLICT ("url") DO NOTHING;

-- Point every product photo at its new library entry. Matched by URL, the only
-- thing the two tables share — and only where the link is still unset, so a
-- re-run cannot repoint a row a human has since changed.
UPDATE "product_images" pi
SET "media_asset_id" = ma."id"
FROM "media_assets" ma
WHERE ma."url" = pi."url"
  AND pi."media_asset_id" IS NULL;
