-- TASK-2405 (two admin tabs signing each other out).
--
-- WHAT  three nullable columns on refresh_tokens: when the row was rotated, the id of the
--       row that replaced it (a plain column, no FK), and when its one-time replay was used.
-- WHY   two tabs refreshing with the same cookie: the second presents a just-rotated token,
--       which strict reuse detection read as theft and answered by revoking every session.
--       The API now honours ONE replay within 10 s of the rotation. Additive; existing rows
--       stay NULL, which keeps the old strict behaviour for them.
--
-- DDL below generated with `prisma migrate diff --script`.

-- AlterTable
ALTER TABLE "refresh_tokens" ADD COLUMN     "grace_used_at" TIMESTAMP(3),
ADD COLUMN     "replaced_by_id" TEXT,
ADD COLUMN     "rotated_at" TIMESTAMP(3);
