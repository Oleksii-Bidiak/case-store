-- TASK-2047 / TASK-2046 / TASK-951 (R2 "payment from one place", B-12 theme 1) —
-- backfill of the order money ledger created by 20261101120000_order_money_ledger.
--
-- WHAT
--   Writes `order_money_entries` from the four pre-ledger sources, sets the four
--   money totals on `orders` and `returns.credit_kop`. No DDL: the enum values this
--   file uses were added by the previous migration and Postgres refuses to use a
--   value in the transaction that added it.
--
-- WHY
--   Money used to live in Return.refundedAmount, Payment.refundedAmount, the
--   amount-less paymentStatus label and the analytics "remainder". From R2 the
--   ledger is the only record; every order must start with entries that say what
--   the old sources said — and never more than came in.
--
-- BACKFILL (every row written is `legacy = true`; integer kopecks = ROUND(x*100)):
--   IN
--   1. one LIQPAY_PAYMENT per SUCCEEDED/REFUNDED attempt (payment_id, provider_ref
--      'success' — the key the A2 webhook writes, so a late callback is a no-op);
--      occurred_at = settled_at, else the order's paid_at, else the attempt's
--      updated_at;
--   2. an order labelled PAID / PARTIALLY_REFUNDED / REFUNDED with no settled
--      attempt -> its total, kind by delivery (NOVA_POSHTA COD_NOVA_POSHTA, PICKUP
--      PAID_AT_POINT, COURIER PAID_TO_COURIER, otherwise BANK_TRANSFER);
--      occurred_at = paid_at, else the first PAYMENT_STATUS history row into PAID,
--      else updated_at.
--   OUT — per order R = Σ Return.refundedAmount, P = Σ provider refunds (an attempt
--   REFUNDED counts its amount, otherwise its refunded_amount), F = IN when the
--   label is REFUNDED. Written: R, then LIQPAY_REFUND for max(P − R, 0), then the
--   residual up to max(F, R, P) — the MAXIMUM, not the sum, because the two
--   journals may have recorded the same money twice (TASK-951). The ceiling is IN:
--   3. one OUT per return with a refunded amount (return_id; CASH_REFUND on a
--      pickup order, TRANSFER_REFUND otherwise), capped cumulatively at IN;
--   4. one LIQPAY_REFUND per order for max(P − R, 0) (payment_id = the attempt
--      with the largest refund, provider_ref 'legacy-refund', CONFIRMED), capped
--      at IN − OUT so far;
--   5. label REFUNDED -> a residual OUT (no return, no payment) up to IN.
--   FLAGS
--   6. label PARTIALLY_REFUNDED with no amount anywhere (R = P = 0) -> no OUT entry
--      is invented; one PAYMENT_STATUS history row PARTIALLY_REFUNDED ->
--      PARTIALLY_REFUNDED with note LEGACY_MONEY_UNKNOWN (the card asks for it);
--   7. an ORDER in status REFUNDED with no money in, or whose last move into
--      REFUNDED came from CANCELLED -> CANCELLED, with a STATUS history row
--      REFUNDED -> CANCELLED (changed_by NULL). CANCELLED never becomes REFUNDED
--      under R2 (TASK-1970).
--   TOTALS
--   8. returns.credit_kop for decision REFUND: the returned units' value minus their
--      share of the promo discount — largest remainder over the order's lines in
--      (created_at, id) order, then telescoped over partial returns — exactly
--      `allocateReturnCredit` + `unitsCreditKop` in src/order/order-money.ts.
--      Add-ons and shipping are not part of it (plan assumption 1);
--   9. orders.paid_kop / refunded_kop (net of reversals, voided ignored) /
--      return_credit_kop / balance_kop (= due − paid + refunded) — exactly
--      `deriveBalance` in src/order/order-money.ts: due = 0 for a CANCELLED
--      order; for a REFUNDED one GREATEST(0, LEAST(total − credit, paid −
--      refunded)) — what the shop may keep, never more than it still holds;
--      total − return credit otherwise.
--   payment_status labels are NOT rewritten. Every statement is guarded, so a
--   replay changes nothing (pinned by test/money-backfill.int-spec.ts, which runs
--   the marked section as shipped). VERIFY then RAISEs — rolling the migration
--   back — unless the totals equal the ledger and the balance equals
--   `deriveBalance` recomputed per order from the entries, refunded <= paid, the
--   legacy IN and OUT of every order equal an independent recomputation from the
--   sources, and no REFUND return is credited above the goods it brings back
--   (nor an order's returns above its goods net of the promo).
--   R2 review (before any merge): step 9 and VERIFY (a) used due = 0 for a
--   REFUNDED order, which showed a legacy REFUNDED order still holding money
--   (label PARTIALLY_REFUNDED) as «Винні покупцю»; both now follow the TS rule.
--
-- COUNTS (throwaway copy of store_dev, `prisma migrate deploy`, 2026-11-01)
--   before: 15 orders (Σ total 18 001 510 kop) by payment_status FAILED 1, PAID 7,
--           PENDING 5, REFUNDED 2; order status REFUNDED 1; returns with
--           refunded_amount 0 (Σ 0); attempts with a provider refund 0 (Σ 0);
--           settled LiqPay attempts 1 (Σ 129 900 kop); R∩P overlap: none;
--           PARTIALLY_REFUNDED without an amount: none; capped at IN: none.
--   after:  entries LIQPAY_PAYMENT 1 (Σ 129 900), BANK_TRANSFER 8 (Σ 12 485 410 —
--           every legacy paid order there is delivery OTHER), TRANSFER_REFUND 2
--           (Σ 2 988 800, the two REFUNDED residuals); Σ paid_kop 12 615 310,
--           Σ refunded_kop 2 988 800, Σ balance_kop 3 227 500; LEGACY_MONEY_UNKNOWN 0;
--           order status REFUNDED still 1 (paid, not from CANCELLED); returns with
--           credit_kop 0. A replay of the whole file inserted and updated 0 rows.
--   On the demo stand the success condition is the same: VERIFY passes, and
--   Σ legacy IN = settled attempts + labelled-paid totals.

-- BEFORE: what the old sources say (NOTICE only, writes nothing).
DO $$
DECLARE
  r_count int;
  r_kop bigint;
  p_count int;
  p_kop bigint;
  in_count int;
  in_kop bigint;
  labels text;
  refunded_orders int;
  overlap text;
  unknown text;
  capped text;
BEGIN
  SELECT count(*), COALESCE(sum(ROUND("refunded_amount" * 100)), 0)
    INTO r_count, r_kop
    FROM "returns" WHERE ROUND(COALESCE("refunded_amount", 0) * 100) > 0;

  SELECT count(*), COALESCE(sum(CASE WHEN "status" = 'REFUNDED' THEN ROUND("amount" * 100)
                                     ELSE ROUND("refunded_amount" * 100) END), 0)
    INTO p_count, p_kop
    FROM "payments"
   WHERE ("status" = 'REFUNDED' AND ROUND("amount" * 100) > 0) OR ROUND("refunded_amount" * 100) > 0;

  SELECT count(*), COALESCE(sum(ROUND("amount" * 100)), 0)
    INTO in_count, in_kop
    FROM "payments" WHERE "status" IN ('SUCCEEDED', 'REFUNDED') AND ROUND("amount" * 100) > 0;

  SELECT COALESCE(string_agg(s || '=' || n, ', ' ORDER BY s), '-')
    INTO labels
    FROM (SELECT "payment_status"::text AS s, count(*) AS n FROM "orders" GROUP BY 1) AS t;

  SELECT count(*) INTO refunded_orders FROM "orders" WHERE "status" = 'REFUNDED';

  SELECT COALESCE(string_agg(o."id", ', ' ORDER BY o."id"), '-') INTO overlap
    FROM "orders" AS o
   WHERE EXISTS (SELECT 1 FROM "returns" AS r
                  WHERE r."order_id" = o."id" AND ROUND(COALESCE(r."refunded_amount", 0) * 100) > 0)
     AND EXISTS (SELECT 1 FROM "payments" AS p
                  WHERE p."order_id" = o."id"
                    AND ((p."status" = 'REFUNDED' AND ROUND(p."amount" * 100) > 0)
                         OR ROUND(p."refunded_amount" * 100) > 0));

  SELECT COALESCE(string_agg(o."id", ', ' ORDER BY o."id"), '-') INTO unknown
    FROM "orders" AS o
   WHERE o."payment_status" = 'PARTIALLY_REFUNDED'
     AND NOT EXISTS (SELECT 1 FROM "returns" AS r
                      WHERE r."order_id" = o."id" AND ROUND(COALESCE(r."refunded_amount", 0) * 100) > 0)
     AND NOT EXISTS (SELECT 1 FROM "payments" AS p
                      WHERE p."order_id" = o."id"
                        AND ((p."status" = 'REFUNDED' AND ROUND(p."amount" * 100) > 0)
                             OR ROUND(p."refunded_amount" * 100) > 0));

  WITH src AS (
    SELECT o."id",
           COALESCE((SELECT sum(ROUND(p."amount" * 100)) FROM "payments" AS p
                      WHERE p."order_id" = o."id" AND p."status" IN ('SUCCEEDED', 'REFUNDED')
                        AND ROUND(p."amount" * 100) > 0), 0) AS liqpay_in,
           COALESCE((SELECT sum(ROUND(r."refunded_amount" * 100)) FROM "returns" AS r
                      WHERE r."order_id" = o."id" AND ROUND(COALESCE(r."refunded_amount", 0) * 100) > 0), 0) AS r_out,
           COALESCE((SELECT sum(CASE WHEN p."status" = 'REFUNDED' THEN ROUND(p."amount" * 100)
                                     ELSE ROUND(p."refunded_amount" * 100) END)
                       FROM "payments" AS p WHERE p."order_id" = o."id"), 0) AS p_out,
           o."payment_status", ROUND(o."total" * 100) AS total_kop
      FROM "orders" AS o
  )
  SELECT COALESCE(string_agg("id", ', ' ORDER BY "id"), '-') INTO capped
    FROM src
   WHERE GREATEST(r_out, p_out) >
         CASE WHEN liqpay_in > 0 THEN liqpay_in
              WHEN "payment_status" IN ('PAID', 'PARTIALLY_REFUNDED', 'REFUNDED') THEN total_kop
              ELSE 0 END;

  RAISE NOTICE 'R2 money BEFORE: returns with refunded_amount % (Σ % kop)', r_count, r_kop;
  RAISE NOTICE 'R2 money BEFORE: attempts with a provider refund % (Σ % kop)', p_count, p_kop;
  RAISE NOTICE 'R2 money BEFORE: settled LiqPay attempts % (Σ % kop)', in_count, in_kop;
  RAISE NOTICE 'R2 money BEFORE: orders by payment_status: %', labels;
  RAISE NOTICE 'R2 money BEFORE: orders in status REFUNDED %', refunded_orders;
  RAISE NOTICE 'R2 money BEFORE: orders with BOTH return and provider refunds (max, not sum): %', overlap;
  RAISE NOTICE 'R2 money BEFORE: PARTIALLY_REFUNDED with no amount (LEGACY_MONEY_UNKNOWN): %', unknown;
  RAISE NOTICE 'R2 money BEFORE: orders whose refunds exceed what came in (capped at IN): %', capped;
END $$;

-- BACKFILL:BEGIN
-- Hand-written. Every statement only writes what is still missing, so a
-- restore-then-migrate replay is a no-op. No semicolons inside statements: the
-- int spec splits this section on them.

-- 1. IN: one LIQPAY_PAYMENT per settled LiqPay attempt.
INSERT INTO "order_money_entries"
  ("id", "order_id", "direction", "kind", "amount_kop", "payment_id", "provider_ref", "reason", "legacy", "occurred_at")
SELECT gen_random_uuid()::text, p."order_id", 'IN'::"MoneyDirection", 'LIQPAY_PAYMENT'::"MoneyEntryKind",
       ROUND(p."amount" * 100)::int, p."id", 'success', 'R2 backfill: settled LiqPay attempt', true,
       COALESCE(p."settled_at", o."paid_at", p."updated_at")
FROM "payments" AS p
JOIN "orders" AS o ON o."id" = p."order_id"
WHERE p."status" IN ('SUCCEEDED', 'REFUNDED')
  AND ROUND(p."amount" * 100) > 0
  AND NOT EXISTS (
    SELECT 1 FROM "order_money_entries" AS e
    WHERE e."payment_id" = p."id" AND e."provider_ref" = 'success'
  );

-- 2. IN: a paid label with no settled attempt is the total, by delivery kind.
INSERT INTO "order_money_entries"
  ("id", "order_id", "direction", "kind", "amount_kop", "reason", "legacy", "occurred_at")
SELECT gen_random_uuid()::text, o."id", 'IN'::"MoneyDirection",
       (CASE
          WHEN o."payment_method" = 'BANK_TRANSFER' THEN 'BANK_TRANSFER'
          WHEN o."delivery_method" = 'NOVA_POSHTA' THEN 'COD_NOVA_POSHTA'
          WHEN o."delivery_method" = 'PICKUP' THEN 'PAID_AT_POINT'
          WHEN o."delivery_method" = 'COURIER' THEN 'PAID_TO_COURIER'
          ELSE 'BANK_TRANSFER'
        END)::"MoneyEntryKind",
       ROUND(o."total" * 100)::int, 'R2 backfill: paid label without a settled attempt', true,
       COALESCE(
         o."paid_at",
         (SELECT min(h."changed_at") FROM "order_status_history" AS h
           WHERE h."order_id" = o."id" AND h."change_type" = 'PAYMENT_STATUS'
             AND h."to_payment_status" = 'PAID'),
         o."updated_at")
FROM "orders" AS o
WHERE o."payment_status" IN ('PAID', 'PARTIALLY_REFUNDED', 'REFUNDED')
  AND ROUND(o."total" * 100) > 0
  AND NOT EXISTS (
    SELECT 1 FROM "payments" AS p
    WHERE p."order_id" = o."id" AND p."status" IN ('SUCCEEDED', 'REFUNDED') AND ROUND(p."amount" * 100) > 0
  )
  AND NOT EXISTS (
    SELECT 1 FROM "order_money_entries" AS e WHERE e."order_id" = o."id" AND e."direction" = 'IN'
  );

-- 3. OUT: one payout per return with a refunded amount, capped cumulatively at IN.
WITH money_in AS (
  SELECT e."order_id",
         sum(CASE WHEN e."reversal_of_id" IS NULL THEN e."amount_kop" ELSE -e."amount_kop" END) AS in_kop
  FROM "order_money_entries" AS e
  WHERE e."direction" = 'IN' AND e."voided_at" IS NULL
  GROUP BY e."order_id"
),
paid_back AS (
  SELECT r."id", r."order_id", ROUND(r."refunded_amount" * 100)::int AS kop,
         COALESCE(r."resolved_at", r."updated_at") AS at,
         COALESCE(sum(ROUND(r."refunded_amount" * 100)::int) OVER (
           PARTITION BY r."order_id" ORDER BY r."requested_at", r."id"
           ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING), 0) AS before_kop
  FROM "returns" AS r
  WHERE ROUND(COALESCE(r."refunded_amount", 0) * 100) > 0
)
INSERT INTO "order_money_entries"
  ("id", "order_id", "direction", "kind", "amount_kop", "return_id", "reason", "legacy", "occurred_at")
SELECT gen_random_uuid()::text, b."order_id", 'OUT'::"MoneyDirection",
       (CASE WHEN o."delivery_method" = 'PICKUP' THEN 'CASH_REFUND' ELSE 'TRANSFER_REFUND' END)::"MoneyEntryKind",
       LEAST(b.kop, i.in_kop - b.before_kop)::int, b."id", 'R2 backfill: Return.refundedAmount', true, b.at
FROM paid_back AS b
JOIN money_in AS i ON i."order_id" = b."order_id"
JOIN "orders" AS o ON o."id" = b."order_id"
WHERE LEAST(b.kop, i.in_kop - b.before_kop) > 0
  AND NOT EXISTS (SELECT 1 FROM "order_money_entries" AS e WHERE e."return_id" = b."id");

-- 4. OUT: what the provider refunded beyond the returns, capped at IN − OUT so far.
WITH provider AS (
  SELECT p."order_id",
         sum(CASE WHEN p."status" = 'REFUNDED' THEN ROUND(p."amount" * 100)
                  ELSE ROUND(p."refunded_amount" * 100) END)::int AS p_kop,
         (array_agg(p."id" ORDER BY CASE WHEN p."status" = 'REFUNDED' THEN ROUND(p."amount" * 100)
                                         ELSE ROUND(p."refunded_amount" * 100) END DESC,
                                    p."created_at", p."id"))[1] AS payment_id,
         max(p."updated_at") AS at
  FROM "payments" AS p
  WHERE (p."status" = 'REFUNDED' AND ROUND(p."amount" * 100) > 0) OR ROUND(p."refunded_amount" * 100) > 0
  GROUP BY p."order_id"
),
from_returns AS (
  SELECT r."order_id", sum(ROUND(r."refunded_amount" * 100))::int AS r_kop
  FROM "returns" AS r
  WHERE ROUND(COALESCE(r."refunded_amount", 0) * 100) > 0
  GROUP BY r."order_id"
),
ledger AS (
  SELECT e."order_id",
         sum(CASE WHEN e."direction" = 'IN' THEN CASE WHEN e."reversal_of_id" IS NULL THEN e."amount_kop" ELSE -e."amount_kop" END ELSE 0 END) AS in_kop,
         sum(CASE WHEN e."direction" = 'OUT' THEN CASE WHEN e."reversal_of_id" IS NULL THEN e."amount_kop" ELSE -e."amount_kop" END ELSE 0 END) AS out_kop
  FROM "order_money_entries" AS e
  WHERE e."voided_at" IS NULL
  GROUP BY e."order_id"
)
INSERT INTO "order_money_entries"
  ("id", "order_id", "direction", "kind", "amount_kop", "payment_id", "provider_ref", "provider_state", "reason", "legacy", "occurred_at")
SELECT gen_random_uuid()::text, p."order_id", 'OUT'::"MoneyDirection", 'LIQPAY_REFUND'::"MoneyEntryKind",
       LEAST(GREATEST(p.p_kop - COALESCE(r.r_kop, 0), 0), l.in_kop - l.out_kop)::int,
       p.payment_id, 'legacy-refund', 'CONFIRMED'::"MoneyProviderState",
       'R2 backfill: provider refund beyond the returns', true, p.at
FROM provider AS p
JOIN ledger AS l ON l."order_id" = p."order_id"
LEFT JOIN from_returns AS r ON r."order_id" = p."order_id"
WHERE LEAST(GREATEST(p.p_kop - COALESCE(r.r_kop, 0), 0), l.in_kop - l.out_kop) > 0
  AND NOT EXISTS (
    SELECT 1 FROM "order_money_entries" AS e
    WHERE e."order_id" = p."order_id" AND e."direction" = 'OUT' AND e."legacy" AND e."payment_id" IS NOT NULL
  );

-- 5. OUT: a REFUNDED label means everything that came in went back.
WITH ledger AS (
  SELECT e."order_id",
         sum(CASE WHEN e."direction" = 'IN' THEN CASE WHEN e."reversal_of_id" IS NULL THEN e."amount_kop" ELSE -e."amount_kop" END ELSE 0 END) AS in_kop,
         sum(CASE WHEN e."direction" = 'OUT' THEN CASE WHEN e."reversal_of_id" IS NULL THEN e."amount_kop" ELSE -e."amount_kop" END ELSE 0 END) AS out_kop
  FROM "order_money_entries" AS e
  WHERE e."voided_at" IS NULL
  GROUP BY e."order_id"
)
INSERT INTO "order_money_entries"
  ("id", "order_id", "direction", "kind", "amount_kop", "reason", "legacy", "occurred_at")
SELECT gen_random_uuid()::text, o."id", 'OUT'::"MoneyDirection",
       (CASE WHEN o."delivery_method" = 'PICKUP' THEN 'CASH_REFUND' ELSE 'TRANSFER_REFUND' END)::"MoneyEntryKind",
       (l.in_kop - l.out_kop)::int, 'R2 backfill: REFUNDED label without an amount', true,
       COALESCE(
         (SELECT min(h."changed_at") FROM "order_status_history" AS h
           WHERE h."order_id" = o."id" AND h."change_type" = 'PAYMENT_STATUS'
             AND h."to_payment_status" = 'REFUNDED'),
         o."updated_at")
FROM "orders" AS o
JOIN ledger AS l ON l."order_id" = o."id"
WHERE o."payment_status" = 'REFUNDED'
  AND l.in_kop - l.out_kop > 0
  AND NOT EXISTS (
    SELECT 1 FROM "order_money_entries" AS e
    WHERE e."order_id" = o."id" AND e."direction" = 'OUT' AND e."legacy"
      AND e."return_id" IS NULL AND e."payment_id" IS NULL
  );

-- 6. PARTIALLY_REFUNDED with no amount anywhere: flag it, invent nothing.
INSERT INTO "order_status_history"
  ("id", "order_id", "change_type", "from_payment_status", "to_payment_status", "note", "changed_by", "changed_at")
SELECT gen_random_uuid()::text, o."id", 'PAYMENT_STATUS'::"OrderHistoryChangeType",
       'PARTIALLY_REFUNDED'::"PaymentStatus", 'PARTIALLY_REFUNDED'::"PaymentStatus",
       'LEGACY_MONEY_UNKNOWN'::"OrderHistoryNote", NULL, now()
FROM "orders" AS o
WHERE o."payment_status" = 'PARTIALLY_REFUNDED'
  AND NOT EXISTS (
    SELECT 1 FROM "returns" AS r
    WHERE r."order_id" = o."id" AND ROUND(COALESCE(r."refunded_amount", 0) * 100) > 0
  )
  AND NOT EXISTS (
    SELECT 1 FROM "payments" AS p
    WHERE p."order_id" = o."id"
      AND ((p."status" = 'REFUNDED' AND ROUND(p."amount" * 100) > 0) OR ROUND(p."refunded_amount" * 100) > 0)
  )
  AND NOT EXISTS (
    SELECT 1 FROM "order_status_history" AS h
    WHERE h."order_id" = o."id" AND h."note" = 'LEGACY_MONEY_UNKNOWN'
  );

-- 7a. A REFUNDED order with no money in, or reached from CANCELLED: history first ...
INSERT INTO "order_status_history"
  ("id", "order_id", "change_type", "from_status", "to_status", "changed_by", "changed_at")
SELECT gen_random_uuid()::text, o."id", 'STATUS'::"OrderHistoryChangeType",
       'REFUNDED'::"OrderStatus", 'CANCELLED'::"OrderStatus", NULL, now()
FROM "orders" AS o
WHERE o."status" = 'REFUNDED'
  AND (
    NOT EXISTS (
      SELECT 1 FROM "order_money_entries" AS e
      WHERE e."order_id" = o."id" AND e."direction" = 'IN' AND e."voided_at" IS NULL
    )
    OR (
      SELECT h."from_status" FROM "order_status_history" AS h
      WHERE h."order_id" = o."id" AND h."change_type" = 'STATUS' AND h."to_status" = 'REFUNDED'
      ORDER BY h."changed_at" DESC, h."id" DESC
      LIMIT 1
    ) = 'CANCELLED'
  );

-- 7b. ... then the order itself.
UPDATE "orders" AS o
SET "status" = 'CANCELLED'
WHERE o."status" = 'REFUNDED'
  AND (
    NOT EXISTS (
      SELECT 1 FROM "order_money_entries" AS e
      WHERE e."order_id" = o."id" AND e."direction" = 'IN' AND e."voided_at" IS NULL
    )
    OR (
      SELECT h."from_status" FROM "order_status_history" AS h
      WHERE h."order_id" = o."id" AND h."change_type" = 'STATUS' AND h."to_status" = 'REFUNDED'
      ORDER BY h."changed_at" DESC, h."id" DESC
      LIMIT 1
    ) = 'CANCELLED'
  );

-- 8. "To refund" per REFUND-decided return: goods minus their promo share.
WITH lines AS (
  SELECT oi."id" AS item_id, oi."order_id", oi."quantity", oi."created_at",
         ROUND(oi."price" * 100)::bigint * oi."quantity" AS gross
  FROM "order_items" AS oi
  WHERE oi."order_id" IN (
    SELECT r."order_id" FROM "returns" AS r WHERE r."decision" = 'REFUND' AND r."credit_kop" IS NULL
  )
),
totals AS (
  SELECT l."order_id", sum(l.gross) AS g,
         LEAST(sum(l.gross), GREATEST(ROUND(o."discount" * 100)::bigint, 0)) AS d
  FROM lines AS l
  JOIN "orders" AS o ON o."id" = l."order_id"
  GROUP BY l."order_id", o."discount"
),
shares AS (
  SELECT l.item_id, l."order_id", l."quantity", l."created_at", l.gross, t.d,
         CASE WHEN t.g = 0 THEN 0 ELSE (t.d * l.gross) / t.g END AS base_share,
         CASE WHEN t.g = 0 THEN 0 ELSE (t.d * l.gross) % t.g END AS rem
  FROM lines AS l
  JOIN totals AS t ON t."order_id" = l."order_id"
),
ranked AS (
  SELECT s.*,
         row_number() OVER (PARTITION BY s."order_id" ORDER BY s.rem DESC, s."created_at", s.item_id) AS rn,
         s.d - sum(s.base_share) OVER (PARTITION BY s."order_id") AS leftover
  FROM shares AS s
),
net AS (
  SELECT k.item_id, k."quantity",
         k.gross - k.base_share - CASE WHEN k.rn <= k.leftover THEN 1 ELSE 0 END AS net_kop
  FROM ranked AS k
),
units AS (
  SELECT ret."id" AS return_id, ri."order_item_id", ri."quantity" AS k,
         COALESCE(sum(ri."quantity") OVER (
           PARTITION BY ri."order_item_id" ORDER BY ret."requested_at", ret."id", ri."id"
           ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING), 0) AS before_k
  FROM "returns" AS ret
  JOIN "return_items" AS ri ON ri."return_id" = ret."id"
  WHERE ret."decision" = 'REFUND'
),
credit AS (
  SELECT u.return_id,
         sum((n.net_kop * LEAST(u.before_k + u.k, n."quantity")) / n."quantity"
             - (n.net_kop * LEAST(u.before_k, n."quantity")) / n."quantity") AS kop
  FROM units AS u
  JOIN net AS n ON n.item_id = u."order_item_id"
  WHERE n."quantity" > 0
  GROUP BY u.return_id
)
UPDATE "returns" AS r
SET "credit_kop" = c.kop::int
FROM credit AS c
WHERE r."id" = c.return_id
  AND r."decision" = 'REFUND'
  AND r."credit_kop" IS NULL;

-- 9. The four totals on every order, from the ledger and the returns.
WITH ledger AS (
  SELECT e."order_id",
         sum(CASE WHEN e."direction" = 'IN' THEN CASE WHEN e."reversal_of_id" IS NULL THEN e."amount_kop" ELSE -e."amount_kop" END ELSE 0 END) AS paid,
         sum(CASE WHEN e."direction" = 'OUT' THEN CASE WHEN e."reversal_of_id" IS NULL THEN e."amount_kop" ELSE -e."amount_kop" END ELSE 0 END) AS refunded
  FROM "order_money_entries" AS e
  WHERE e."voided_at" IS NULL
  GROUP BY e."order_id"
),
credits AS (
  SELECT r."order_id", sum(r."credit_kop") AS credit
  FROM "returns" AS r
  WHERE r."credit_kop" IS NOT NULL
  GROUP BY r."order_id"
),
target AS (
  SELECT o."id",
         COALESCE(l.paid, 0)::int AS paid,
         COALESCE(l.refunded, 0)::int AS refunded,
         COALESCE(c.credit, 0)::int AS credit,
         ((CASE WHEN o."status" = 'CANCELLED' THEN 0
                WHEN o."status" = 'REFUNDED'
                  THEN GREATEST(0, LEAST(ROUND(o."total" * 100) - COALESCE(c.credit, 0),
                                         COALESCE(l.paid, 0) - COALESCE(l.refunded, 0)))
                ELSE ROUND(o."total" * 100) - COALESCE(c.credit, 0) END)
          - COALESCE(l.paid, 0) + COALESCE(l.refunded, 0))::int AS balance
  FROM "orders" AS o
  LEFT JOIN ledger AS l ON l."order_id" = o."id"
  LEFT JOIN credits AS c ON c."order_id" = o."id"
)
UPDATE "orders" AS o
SET "paid_kop" = t.paid,
    "refunded_kop" = t.refunded,
    "return_credit_kop" = t.credit,
    "balance_kop" = t.balance
FROM target AS t
WHERE t."id" = o."id"
  AND (o."paid_kop", o."refunded_kop", o."return_credit_kop", o."balance_kop")
      IS DISTINCT FROM (t.paid, t.refunded, t.credit, t.balance);
-- BACKFILL:END

-- VERIFY:BEGIN
DO $$
DECLARE
  bad int;
  ids text;
  kinds text;
  paid_sum bigint;
  refunded_sum bigint;
  flagged int;
BEGIN
  -- a. The totals on every order are its ledger, and the balance is what
  -- `deriveBalance` (src/order/order-money.ts) gives for them — recomputed here
  -- per order from the entries, the returns and the order's own total/status,
  -- not read back from step 9.
  SELECT count(*), string_agg(x."id", ', ' ORDER BY x."id") INTO bad, ids
  FROM (
    SELECT o."id", o."paid_kop", o."refunded_kop", o."return_credit_kop", o."balance_kop",
           o."status", ROUND(o."total" * 100) AS total_kop,
           COALESCE((SELECT sum(CASE WHEN e."reversal_of_id" IS NULL THEN e."amount_kop" ELSE -e."amount_kop" END)
                       FROM "order_money_entries" AS e
                      WHERE e."order_id" = o."id" AND e."direction" = 'IN' AND e."voided_at" IS NULL), 0) AS exp_paid,
           COALESCE((SELECT sum(CASE WHEN e."reversal_of_id" IS NULL THEN e."amount_kop" ELSE -e."amount_kop" END)
                       FROM "order_money_entries" AS e
                      WHERE e."order_id" = o."id" AND e."direction" = 'OUT' AND e."voided_at" IS NULL), 0) AS exp_refunded,
           COALESCE((SELECT sum(r."credit_kop") FROM "returns" AS r
                      WHERE r."order_id" = o."id" AND r."credit_kop" IS NOT NULL), 0) AS exp_credit
    FROM "orders" AS o
  ) AS x
  WHERE x."paid_kop" <> x.exp_paid
     OR x."refunded_kop" <> x.exp_refunded
     OR x."return_credit_kop" <> x.exp_credit
     OR x."balance_kop" <>
        (CASE x."status"
           WHEN 'CANCELLED' THEN 0
           WHEN 'REFUNDED' THEN GREATEST(0, LEAST(x.total_kop - x.exp_credit, x.exp_paid - x.exp_refunded))
           ELSE x.total_kop - x.exp_credit
         END) - x.exp_paid + x.exp_refunded;
  IF bad > 0 THEN
    RAISE EXCEPTION 'R2 money VERIFY: % orders whose totals differ from their ledger: %', bad, ids;
  END IF;

  -- e. Return credit, checked against the goods themselves (not against step 8's
  -- arithmetic): a REFUND return is never credited below 0 or above the gross of
  -- the units it brings back, and an order's REFUND returns together never above
  -- its goods less the promo discount. One-sided on purpose — an operator may
  -- lower a credit (TASK-2046), never raise it.
  SELECT count(*), string_agg(r."id", ', ' ORDER BY r."id") INTO bad, ids
  FROM "returns" AS r
  WHERE r."decision" = 'REFUND' AND r."credit_kop" IS NOT NULL
    AND (r."credit_kop" < 0
         OR r."credit_kop" > COALESCE((
              SELECT sum(ROUND(oi."price" * 100)::bigint * ri."quantity")
                FROM "return_items" AS ri
                JOIN "order_items" AS oi ON oi."id" = ri."order_item_id"
               WHERE ri."return_id" = r."id"), 0));
  IF bad > 0 THEN
    RAISE EXCEPTION 'R2 money VERIFY: % returns credited more than the goods they bring back: %', bad, ids;
  END IF;

  SELECT count(*), string_agg(o."id", ', ' ORDER BY o."id") INTO bad, ids
  FROM "orders" AS o
  JOIN LATERAL (
    SELECT COALESCE(sum(ROUND(oi."price" * 100)::bigint * oi."quantity"), 0) AS gross
      FROM "order_items" AS oi WHERE oi."order_id" = o."id"
  ) AS g ON true
  WHERE (SELECT COALESCE(sum(r."credit_kop"), 0) FROM "returns" AS r
          WHERE r."order_id" = o."id" AND r."decision" = 'REFUND' AND r."credit_kop" IS NOT NULL)
        > g.gross - LEAST(g.gross, GREATEST(ROUND(o."discount" * 100)::bigint, 0));
  IF bad > 0 THEN
    RAISE EXCEPTION 'R2 money VERIFY: % orders whose returns are credited more than the goods net of the promo: %', bad, ids;
  END IF;

  -- b. Never more out than in.
  SELECT count(*), string_agg("id", ', ' ORDER BY "id") INTO bad, ids
  FROM "orders" WHERE "refunded_kop" > "paid_kop" OR "paid_kop" < 0 OR "refunded_kop" < 0;
  IF bad > 0 THEN
    RAISE EXCEPTION 'R2 money VERIFY: % orders refunded more than paid: %', bad, ids;
  END IF;

  -- c/d. Legacy IN and OUT of every order equal an independent recomputation
  -- from the old sources (orders already carrying non-legacy rows are written by
  -- the live code, not by this backfill, and are left out).
  WITH src AS (
    SELECT o."id", o."payment_status",
           COALESCE((SELECT sum(ROUND(p."amount" * 100)) FROM "payments" AS p
                      WHERE p."order_id" = o."id" AND p."status" IN ('SUCCEEDED', 'REFUNDED')
                        AND ROUND(p."amount" * 100) > 0), 0) AS liqpay_in,
           ROUND(o."total" * 100) AS total_kop,
           COALESCE((SELECT sum(ROUND(r."refunded_amount" * 100)) FROM "returns" AS r
                      WHERE r."order_id" = o."id"
                        AND ROUND(COALESCE(r."refunded_amount", 0) * 100) > 0), 0) AS r_out,
           COALESCE((SELECT sum(CASE WHEN p."status" = 'REFUNDED' THEN ROUND(p."amount" * 100)
                                     ELSE ROUND(p."refunded_amount" * 100) END)
                       FROM "payments" AS p
                      WHERE p."order_id" = o."id"
                        AND ((p."status" = 'REFUNDED' AND ROUND(p."amount" * 100) > 0)
                             OR ROUND(p."refunded_amount" * 100) > 0)), 0) AS p_out
    FROM "orders" AS o
    WHERE NOT EXISTS (
      SELECT 1 FROM "order_money_entries" AS e WHERE e."order_id" = o."id" AND NOT e."legacy"
    )
  ),
  expected AS (
    SELECT s."id",
           CASE WHEN s.liqpay_in > 0 THEN s.liqpay_in
                WHEN s."payment_status" IN ('PAID', 'PARTIALLY_REFUNDED', 'REFUNDED') AND s.total_kop > 0
                  THEN s.total_kop
                ELSE 0 END AS in_kop,
           s.r_out, s.p_out, s."payment_status"
    FROM src AS s
  ),
  expected_out AS (
    SELECT x."id", x.in_kop,
           CASE WHEN x."payment_status" = 'REFUNDED' THEN x.in_kop
                ELSE LEAST(x.in_kop, GREATEST(x.r_out, x.p_out)) END AS out_kop
    FROM expected AS x
  ),
  written AS (
    SELECT e."order_id",
           sum(CASE WHEN e."direction" = 'IN' THEN e."amount_kop" ELSE 0 END) AS in_kop,
           sum(CASE WHEN e."direction" = 'OUT' THEN e."amount_kop" ELSE 0 END) AS out_kop
    FROM "order_money_entries" AS e
    WHERE e."legacy" AND e."voided_at" IS NULL AND e."reversal_of_id" IS NULL
    GROUP BY e."order_id"
  )
  SELECT count(*), string_agg(x."id", ', ' ORDER BY x."id") INTO bad, ids
  FROM expected_out AS x
  LEFT JOIN written AS w ON w."order_id" = x."id"
  WHERE COALESCE(w.in_kop, 0) <> x.in_kop OR COALESCE(w.out_kop, 0) <> x.out_kop;
  IF bad > 0 THEN
    RAISE EXCEPTION 'R2 money VERIFY: % orders whose legacy IN/OUT differ from the old sources: %', bad, ids;
  END IF;

  -- AFTER: what was written.
  SELECT COALESCE(string_agg(k || ' ' || n || ' (Σ ' || s || ' kop)', ', ' ORDER BY k), '-') INTO kinds
  FROM (
    SELECT "kind"::text AS k, count(*) AS n, sum("amount_kop") AS s
    FROM "order_money_entries" WHERE "legacy" GROUP BY 1
  ) AS t;
  SELECT COALESCE(sum("paid_kop"), 0), COALESCE(sum("refunded_kop"), 0)
    INTO paid_sum, refunded_sum FROM "orders";
  SELECT count(*) INTO flagged FROM "order_status_history" WHERE "note" = 'LEGACY_MONEY_UNKNOWN';
  RAISE NOTICE 'R2 money AFTER: legacy entries by kind: %', kinds;
  RAISE NOTICE 'R2 money AFTER: Σ paid_kop %, Σ refunded_kop %', paid_sum, refunded_sum;
  RAISE NOTICE 'R2 money AFTER: LEGACY_MONEY_UNKNOWN flags %', flagged;
  RAISE NOTICE 'R2 money AFTER: orders in status REFUNDED %',
    (SELECT count(*) FROM "orders" WHERE "status" = 'REFUNDED');
  RAISE NOTICE 'R2 money AFTER: returns with credit_kop % (Σ % kop)',
    (SELECT count(*) FROM "returns" WHERE "credit_kop" IS NOT NULL),
    (SELECT COALESCE(sum("credit_kop"), 0) FROM "returns");
END $$;
-- VERIFY:END
