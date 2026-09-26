-- TASK-699: a device model's slug is the second segment of the public compatibility
-- landing `/catalog/<категорія>/<модель>` (TASK-490). Renaming it now records a
-- `SlugRedirect` row under this new entity kind, so the old address answers 308.
--
-- Enum-only on purpose (ADD VALUE cannot share a transaction with a statement that
-- uses the new value). No backfill: renames made before this migration left no trace
-- anywhere, so there is nothing to reconstruct.

-- AlterEnum
ALTER TYPE "SlugRedirectEntity" ADD VALUE 'DEVICE_MODEL';
