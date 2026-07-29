/*
  The import ledger stops keeping the supplier's image URLs.

  They were recorded for a later "re-host the photos" job, which will not run:
  the owner's decision (2026-07-29) is that the shop does not keep the
  supplier's image URLs at all. The ledger's job is to answer "has this field
  changed since we last wrote it?", and `last_imported` now holds one hash per
  field rather than the values — so this column was the last place the importer
  stored a copy of someone else's data.

  Safe as a plain DROP: the table is empty in every environment (the feature has
  never been released), so no data is lost.
*/
-- AlterTable
ALTER TABLE "catalog_import_items" DROP COLUMN "source_image_urls";
