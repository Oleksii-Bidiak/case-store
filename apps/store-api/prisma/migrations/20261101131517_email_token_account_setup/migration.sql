-- TASK-2010 (B-12 тема 2, checkout sign-up).
--
-- WHAT  a fourth EmailTokenPurpose, ACCOUNT_SETUP: the «Задайте пароль» link sent to an
--       account created password-less at checkout.
-- WHY   the link proves the mailbox exactly like VERIFY (it stamps emailVerifiedAt and
--       claims the address's guest orders) and may also set the first password, so a
--       VERIFY link must not be accepted where a setup link is expected, nor the other
--       way round. Additive; no existing row changes.
--
-- DDL below generated with `prisma migrate dev --create-only`.

-- AlterEnum
ALTER TYPE "EmailTokenPurpose" ADD VALUE 'ACCOUNT_SETUP';
