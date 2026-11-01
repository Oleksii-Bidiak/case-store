-- TASK-2010 (B-12 тема 2 (г), checkout sign-up).
--
-- WHAT  discount_redemptions.phone — the order's phone, normalised — plus an index on
--       (discount_id, phone), and a backfill of the column for existing redemptions.
-- WHY   "per customer" becomes the account OR the phone. A sign-up at checkout mints a
--       fresh account, so the account alone would let one phone redeem a
--       perUserLimit = 1 code once per new e-mail. The per-customer count is
--       `WHERE discount_id = $1 AND (user_id = $2 OR phone = $3)`, which the new index
--       serves next to the existing (user_id) one.
--
-- BACKFILL reproduces `normalizeUaPhone` (src/common/validators/is-ua-phone.decorator.ts)
--       on `orders.shipping_address->>'phone'`: strip every non-digit, then
--         380… → as is;  80… → '3' || digits;  0… → '38' || digits;
--         exactly 9 digits → '380' || digits;  anything else → the bare digits.
--       Approximation, stated: Postgres `\D` follows the database's character classes,
--       so a non-ASCII digit (e.g. Arabic-Indic) would count as a digit here and not in
--       JS. Real order phones are typed through an ASCII mask, so none is expected. A
--       redemption whose order is gone (deleted rows never were — orders are
--       tombstoned) or carries no digits keeps NULL: nothing is guessed.
--
-- DDL below generated with `prisma migrate dev --create-only`.

-- AlterTable
ALTER TABLE "discount_redemptions" ADD COLUMN     "phone" TEXT;

-- CreateIndex
CREATE INDEX "discount_redemptions_discount_id_phone_idx" ON "discount_redemptions"("discount_id", "phone");

-- Backfill
WITH digits AS (
  SELECT dr.id,
         regexp_replace(COALESCE(o.shipping_address->>'phone', ''), '\D', '', 'g') AS d
  FROM "discount_redemptions" dr
  JOIN "orders" o ON o.id = dr.order_id
)
UPDATE "discount_redemptions" dr
SET phone = CASE
  WHEN digits.d LIKE '380%' THEN digits.d
  WHEN digits.d LIKE '80%' THEN '3' || digits.d
  WHEN digits.d LIKE '0%' THEN '38' || digits.d
  WHEN length(digits.d) = 9 THEN '380' || digits.d
  ELSE digits.d
END
FROM digits
WHERE digits.id = dr.id
  AND digits.d <> '';
