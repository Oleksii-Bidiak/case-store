-- TASK-672: `mail_outbox` becomes the multi-channel `notification_outbox`.
--
-- Hand-written as RENAMES, not generated. `prisma migrate diff` cannot see a
-- rename: it emits DROP TABLE "mail_outbox" + CREATE TABLE "notification_outbox",
-- which would silently throw away every PENDING row — letters already promised
-- to customers (order confirmations, password resets) that the worker has not
-- delivered yet. Renaming keeps every row, its attempt counter, its backoff
-- schedule and its last error exactly as they were, so the worker picks the
-- PENDING ones up on its next tick under the new name.
--
-- Constraint and index names below are the ones Prisma derives for the new
-- model (verified against `migrate diff`), so the post-deploy drift check stays
-- empty.
--
-- Backfill: the new `channel` column is NOT NULL DEFAULT 'EMAIL', so Postgres
-- fills it for every existing row in the same statement. Every row that exists
-- today is a letter, so EMAIL is the truth for all of them — no UPDATE needed.
--
-- `type` is deliberately untouched: it answers "what happened", `channel`
-- answers "where it goes". They are never merged into one value.
--
-- Gate: test/notification-outbox-migration.int-spec.ts runs this file verbatim
-- on a populated `mail_outbox` and proves the due PENDING rows are dispatched.

-- RenameTable
ALTER TABLE "mail_outbox" RENAME TO "notification_outbox";

-- RenameColumn
ALTER TABLE "notification_outbox" RENAME COLUMN "recipient" TO "recipient_address";

-- RenameEnum
ALTER TYPE "MailOutboxStatus" RENAME TO "NotificationOutboxStatus";

-- RenamePrimaryKey
ALTER TABLE "notification_outbox" RENAME CONSTRAINT "mail_outbox_pkey" TO "notification_outbox_pkey";

-- RenameIndex
ALTER INDEX "mail_outbox_status_next_attempt_at_idx" RENAME TO "notification_outbox_status_next_attempt_at_idx";

-- CreateEnum
CREATE TYPE "NotificationChannel" AS ENUM ('EMAIL', 'TELEGRAM');

-- AlterTable (this is the backfill: every existing row becomes EMAIL)
ALTER TABLE "notification_outbox" ADD COLUMN "channel" "NotificationChannel" NOT NULL DEFAULT 'EMAIL';

-- CreateIndex
CREATE INDEX "notification_outbox_channel_status_idx" ON "notification_outbox"("channel", "status");
