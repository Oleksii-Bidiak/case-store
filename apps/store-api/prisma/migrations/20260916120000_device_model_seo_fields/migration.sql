-- ─────────────────────────────────────────────────────────────────────────────
-- A device model gets its own admin-editable copy (TASK-490, plan 182 F3).
--
-- WHY. `/catalog/<категорія>/<модель>` — «Чохли для iPhone 15 Pro» — is a real
-- indexed landing page as of this task, and its <title>, H1 and lead paragraph
-- are GENERATED from a dictionary template. A generated title is the right
-- default and the wrong ceiling: the owner has to be able to write the one
-- sentence that wins a query, per model, without a deploy. `Category` has had
-- exactly these overrides since TASK-236; `DeviceModel` is the other half of
-- the pair and had none.
--
-- The fields hang off the MODEL, not off the (category, model) pair, because
-- the pair has no row to hang them on: the page exists exactly while some
-- active product of that category is compatible with that model. "iPhone 15
-- Pro" is also the half of the title that is actually the search query, so one
-- model's copy being shared by every category page it appears on is the right
-- granularity rather than a compromise.
--
-- Purely additive: three NULLable columns, no backfill and no default. NULL
-- means "no override", which is what every existing row wants — the generated
-- template keeps rendering exactly as it did the moment before this ran.
-- `description` is the ON-PAGE lead paragraph, deliberately NOT a duplicate of
-- `meta_description` (the category pattern splits the same way).
-- ─────────────────────────────────────────────────────────────────────────────

-- AlterTable
ALTER TABLE "device_models" ADD COLUMN     "description" TEXT,
ADD COLUMN     "meta_description" TEXT,
ADD COLUMN     "meta_title" TEXT;
