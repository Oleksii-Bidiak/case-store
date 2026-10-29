-- Generation counter of the signed preview links (TASK-668, plan 186).
--
-- Every preview token embeds the version it was issued under; «Відкликати всі
-- прев'ю» (DELETE /api/admin/preview-tokens) increments this column and every
-- older token stops working at once. No table of issued tokens, nothing to walk.
-- Default 0 = every row starts at the first generation; a missing singleton row
-- reads as 0 too. Additive and idempotent in effect: no data is touched.

-- AlterTable
ALTER TABLE "seo_settings" ADD COLUMN "preview_token_version" INTEGER NOT NULL DEFAULT 0;
