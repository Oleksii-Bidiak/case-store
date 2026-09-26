-- ─────────────────────────────────────────────────────────────────────────────
-- Honeypot hits become visible: a SPAM status for contact messages (TASK-761).
--
-- Until now a filled honeypot on the contact forms was answered with a fake
-- success and nothing was written — no row, no counter, a log line without PII.
-- A systematic false positive (a new password manager, a change in Chrome's
-- autofill heuristics) would have eaten every message from that browser with
-- nothing anywhere to show it. The service now stores such a message with this
-- status; the admin inbox leaves it out of «Усі» and of the unread badge and
-- shows it behind a «Спам» filter.
--
-- Additive only: no existing row changes. `ADD VALUE` is appended at the end, so
-- sorting the inbox by status (declaration order) keeps NEW → IN_PROGRESS →
-- READ → ARCHIVED and puts SPAM last. `IF NOT EXISTS` makes a re-run harmless.

-- AlterEnum
ALTER TYPE "ContactMessageStatus" ADD VALUE IF NOT EXISTS 'SPAM';
