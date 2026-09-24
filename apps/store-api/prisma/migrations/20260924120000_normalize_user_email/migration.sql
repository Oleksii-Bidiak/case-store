-- ─────────────────────────────────────────────────────────────────────────────
-- One address, one spelling: lowercase every stored account email (TASK-772).
--
-- THE DEFECT. `users.email` is plain `text` under a case-SENSITIVE unique index,
-- and until TASK-772 only four of eleven email DTOs lowercased their input.
-- Registration kept whatever the shopper typed, Google sign-in brought back its
-- own spelling, and to Postgres `A@Gmail.com` and `a@gmail.com` are two rows —
-- so the same person got a second account, and a password login typed in a
-- different case answered "invalid credentials". Every write path now stores
-- `lower(trim(email))`; this migration brings the rows that predate it into
-- the same shape, because the lookups are now lowercased too and would miss them.
--
-- WHY NO citext / FUNCTIONAL INDEX. Either would make the database TOLERATE two
-- spellings of one address. The fix is that there is only one; the schema stays
-- as it is and this file is data-only.
--
-- COLLISIONS STOP THE DEPLOY. Two existing rows that differ only in case (or in
-- surrounding whitespace) are two real accounts — each with its own orders,
-- addresses and password. Folding them would violate the unique index at best
-- and silently merge two people at worst, so the first block refuses and lists
-- the colliding addresses instead; an operator decides which account survives
-- and re-runs `prisma migrate deploy`. Measured before this was written:
-- store_dev 30 users / 0 groups / 0 rows to change, demo stand 32 / 0 / 0.
-- Soft-deleted rows (`deleted:<id>:<email>`) are included: they sit under the
-- same unique index, and the embedded id keeps them unique after folding.
--
-- IDEMPOTENT. Both UPDATEs touch only rows not already in canonical form, so a
-- re-run changes nothing. Row counts are reported with RAISE NOTICE so a deploy
-- log shows what actually happened — a WHERE that matched nothing is a result,
-- not a silent success.

DO $$
DECLARE
  collisions text;
BEGIN
  SELECT string_agg(format('%s (%s rows)', normalized, cnt), ', ' ORDER BY normalized)
    INTO collisions
    FROM (
      SELECT lower(trim(email)) AS normalized, count(*) AS cnt
        FROM users
       GROUP BY lower(trim(email))
      HAVING count(*) > 1
    ) groups;

  IF collisions IS NOT NULL THEN
    RAISE EXCEPTION
      'TASK-772: users.email has addresses that differ only in case/whitespace: %. '
      'Resolve which account survives for each, then re-run migrate deploy.',
      collisions;
  END IF;
END
$$;

DO $$
DECLARE
  changed integer;
BEGIN
  UPDATE users
     SET email = lower(trim(email))
   WHERE email <> lower(trim(email));
  GET DIAGNOSTICS changed = ROW_COUNT;
  RAISE NOTICE 'TASK-772: normalised % users.email row(s)', changed;

  -- Contact messages are written through the same DTO change (trim-only until
  -- now) and the admin customer card matches them to the account BY EMAIL, so an
  -- old `Olena@Example.com` message would never appear on `olena@example.com`'s
  -- card. No unique index here — nothing to collide.
  UPDATE contact_messages
     SET email = lower(trim(email))
   WHERE email <> lower(trim(email));
  GET DIAGNOSTICS changed = ROW_COUNT;
  RAISE NOTICE 'TASK-772: normalised % contact_messages.email row(s)', changed;
END
$$;
