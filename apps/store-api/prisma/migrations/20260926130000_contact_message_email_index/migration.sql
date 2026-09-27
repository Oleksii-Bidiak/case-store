-- ─────────────────────────────────────────────────────────────────────────────
-- Contact cooldown: one spelling per address, and an index for the probe
-- (TASK-763).
--
-- THE DEFECT. Every public `POST /api/contact` asks "when did this address last
-- write?" to enforce the 10-minute per-email cooldown (TASK-452). `email` was
-- stored as typed, so the query had to be case-insensitive (`ILIKE`), which no
-- b-tree can serve — and there was no index on `email` at all: a sequential scan
-- of the inbox on every submit.
--
-- Since TASK-772 the DTO stores `lower(trim(email))`, and the repository now
-- matches EXACTLY. That is only safe once the rows that predate TASK-772 are in
-- the same shape, which is the first block; the second adds the index.
--
-- NO COLLISION CHECK, unlike `20260924120000_normalize_user_email`: there is no
-- unique constraint on `contact_messages.email` — two messages from one address
-- are the normal case, and folding their spelling merges nothing.
--
-- IDEMPOTENT. The UPDATE touches only rows not already in canonical form; the
-- count is reported with RAISE NOTICE so a deploy log shows what happened.

DO $$
DECLARE
  changed integer;
BEGIN
  UPDATE contact_messages
     SET email = lower(trim(email))
   WHERE email <> lower(trim(email));
  GET DIAGNOSTICS changed = ROW_COUNT;
  RAISE NOTICE 'TASK-763: contact_messages.email normalised on % row(s)', changed;
END
$$;

-- CreateIndex
CREATE INDEX "contact_messages_email_created_at_idx" ON "contact_messages"("email", "created_at" DESC);
