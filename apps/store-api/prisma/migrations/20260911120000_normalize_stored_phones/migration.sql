/*
  One phone number was stored in several spellings, so searching for it failed.

  The storefront checkout posts the value its mask renders — `+380 50 111 2233`
  — while an operator entering the same order by phone types into an unmasked
  field and sends `050 111 2233` or `0501112233`. Every one of those reached the
  columns below unchanged, so a single number lived as three or four different
  strings and the admin order search (`OrderRepository.findAll`, which matches
  `guest_phone` and `users.phone` with `contains`) found whichever spelling it
  happened to be handed and missed the rest. It is also a hard prerequisite for
  the public "check my order" form (TASK-483), which matches on order number +
  phone and cannot do that against a column holding variants.

  The DTOs now normalise at the boundary (TASK-466), so no NEW row can be
  written un-normalised. This migration is the other half: the rows already in
  the table. It reproduces `normalizeUaPhone()`
  (`apps/store-api/src/common/validators/is-ua-phone.decorator.ts`) exactly —
  strip everything that is not a digit, then `380…` stays, `80…` gains a `3`,
  `0…` gains a `38`, a bare 9-digit local number gains a `380`, and anything else
  (a foreign number) keeps its bare digits.

  Deliberately NOT touched: `site_contact_settings.phone`. That one is an
  admin-authored display string printed in the storefront footer exactly as it
  was typed, not a number anything matches on.

  Every statement is idempotent — it skips rows that are already canonical
  (`IS DISTINCT FROM` the normalised value), leaves NULL as NULL, and refuses to
  overwrite a value that carries no digits at all (which would normalise to the
  empty string and destroy it). Re-running the migration changes nothing.

  The helper is created and dropped inside the migration so it does not linger
  in the schema and show up as drift against `schema.prisma`.
*/

CREATE OR REPLACE FUNCTION normalize_ua_phone(value text) RETURNS text AS $$
DECLARE
  digits text;
BEGIN
  IF value IS NULL THEN
    RETURN NULL;
  END IF;

  digits := regexp_replace(value, '\D', '', 'g');

  IF digits LIKE '380%' THEN
    RETURN digits;
  ELSIF digits LIKE '80%' THEN
    RETURN '3' || digits;
  ELSIF digits LIKE '0%' THEN
    RETURN '38' || digits;
  ELSIF length(digits) = 9 THEN
    -- A bare local number, typed without any prefix at all.
    RETURN '380' || digits;
  END IF;

  RETURN digits;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Account phone: the storefront profile form is unmasked, so this column
-- collected whatever each customer typed.
UPDATE "users"
SET "phone" = normalize_ua_phone("phone")
WHERE "phone" IS NOT NULL
  AND normalize_ua_phone("phone") <> ''
  AND "phone" IS DISTINCT FROM normalize_ua_phone("phone");

-- Guest checkout contact — for a guest order this is the only way to reach the
-- buyer, and the column the order search reads.
UPDATE "orders"
SET "guest_phone" = normalize_ua_phone("guest_phone")
WHERE "guest_phone" IS NOT NULL
  AND normalize_ua_phone("guest_phone") <> ''
  AND "guest_phone" IS DISTINCT FROM normalize_ua_phone("guest_phone");

-- Saved delivery addresses.
UPDATE "addresses"
SET "phone" = normalize_ua_phone("phone")
WHERE "phone" IS NOT NULL
  AND normalize_ua_phone("phone") <> ''
  AND "phone" IS DISTINCT FROM normalize_ua_phone("phone");

-- Contact-form submissions. NOT NULL, and the rows predating TASK-407 hold
-- whatever the unvalidated field accepted.
UPDATE "contact_messages"
SET "phone" = normalize_ua_phone("phone")
WHERE normalize_ua_phone("phone") <> ''
  AND "phone" IS DISTINCT FROM normalize_ua_phone("phone");

-- The order's address snapshots are jsonb, so the phone lives inside the
-- document rather than in a column. `jsonb_typeof(... -> 'phone') = 'string'`
-- covers both guards at once: a missing key yields SQL NULL (typeof NULL is
-- NULL, not 'string') and a JSON null yields 'null'. `jsonb_set` rewrites only
-- that one key and leaves the rest of the snapshot byte-for-byte intact.
UPDATE "orders"
SET "shipping_address" = jsonb_set(
      "shipping_address",
      '{phone}',
      to_jsonb(normalize_ua_phone("shipping_address" ->> 'phone'))
    )
WHERE jsonb_typeof("shipping_address" -> 'phone') = 'string'
  AND normalize_ua_phone("shipping_address" ->> 'phone') <> ''
  AND "shipping_address" ->> 'phone' IS DISTINCT FROM
      normalize_ua_phone("shipping_address" ->> 'phone');

UPDATE "orders"
SET "billing_address" = jsonb_set(
      "billing_address",
      '{phone}',
      to_jsonb(normalize_ua_phone("billing_address" ->> 'phone'))
    )
WHERE jsonb_typeof("billing_address" -> 'phone') = 'string'
  AND normalize_ua_phone("billing_address" ->> 'phone') <> ''
  AND "billing_address" ->> 'phone' IS DISTINCT FROM
      normalize_ua_phone("billing_address" ->> 'phone');

DROP FUNCTION normalize_ua_phone(text);
