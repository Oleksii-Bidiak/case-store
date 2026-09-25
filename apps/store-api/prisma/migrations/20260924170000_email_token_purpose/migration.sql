-- TASK-396: an email link can now prove a NEW address before it becomes the
-- login (EMAIL_CHANGE), or undo a change from the old inbox
-- (EMAIL_CHANGE_REVERT). Every existing row is a plain verification link, which
-- is exactly what the column default writes into it — no separate backfill is
-- needed, and none could match anything else.

-- CreateEnum
CREATE TYPE "EmailTokenPurpose" AS ENUM ('VERIFY', 'EMAIL_CHANGE', 'EMAIL_CHANGE_REVERT');

-- AlterTable
ALTER TABLE "email_verification_tokens" ADD COLUMN     "previous_email" TEXT,
ADD COLUMN     "purpose" "EmailTokenPurpose" NOT NULL DEFAULT 'VERIFY';
