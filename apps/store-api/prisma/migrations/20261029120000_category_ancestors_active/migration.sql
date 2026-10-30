-- TASK-1032 (owner decision 2026-10-29): deactivating a category CASCADES to its
-- whole branch. Until now only the public category tree honoured that (its nested
-- include filters `is_active` at every level), so a deactivated parent hid its
-- subcategory PAGES while their PRODUCTS stayed on the PDP, in search, in /products
-- and in the sitemap. `ancestors_active` is the stored answer to «is every ancestor
-- of this row active and live?»; the product visibility rule reads it next to the
-- category's own `is_active`. A row's own flag never feeds its own value — only its
-- descendants' — so an inactive ROOT keeps `true`.
--
-- The application keeps it in step (CategoryRepository.refreshBranchVisibility,
-- the same statement as the backfill below, run inside every write that can change
-- it). Default `true` is exact for every root and for every row of an all-active
-- tree; the backfill corrects the rest.
ALTER TABLE "categories" ADD COLUMN     "ancestors_active" BOOLEAN NOT NULL DEFAULT true;

-- Backfill: walk down from the roots carrying «everything above is on sale»; a row
-- passes it on only when it is active and not a tombstone itself. UNION ALL always
-- terminates — a node on a cycle has its parent on the cycle, so it is never
-- reachable from a root (and is simply left at its current value). Only rows whose
-- value changes are written.
WITH RECURSIVE walk AS (
  SELECT c.id,
         true AS ancestors_active,
         (c.is_active AND c.deleted_at IS NULL) AS passes_on
  FROM "categories" c
  WHERE c.parent_id IS NULL
  UNION ALL
  SELECT c.id,
         w.passes_on,
         (w.passes_on AND c.is_active AND c.deleted_at IS NULL)
  FROM "categories" c
  JOIN walk w ON c.parent_id = w.id
)
UPDATE "categories" AS c
SET "ancestors_active" = w.ancestors_active
FROM walk w
WHERE c.id = w.id
  AND c.ancestors_active IS DISTINCT FROM w.ancestors_active;
