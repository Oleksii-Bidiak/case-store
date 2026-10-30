-- TASK-1661: Nova Poshta delivery is never free — the shopper pays the carrier's
-- tariff, priced on the checkout, and nothing implements a «від 1 000 ₴» rule.
-- 20260926110000_backfill_info_pages wrote exactly that promise into the /info
-- «Доставка» excerpt on every stand it ran on; the seed copy has since been
-- corrected, and an applied migration is never edited, so this one brings the
-- migrated stands in line with the seed.
--
-- Only the untouched backfill text is replaced: an excerpt the owner rewrote
-- (even to promise free delivery of their own) is theirs and stays as it is.
-- Running it twice changes nothing — the second run matches no row.
UPDATE "pages"
SET "excerpt" = 'Відправляємо замовлення день у день при оформленні до 18:00. Нова Пошта — за тарифом перевізника.',
    "updated_at" = now()
WHERE "kind" = 'INFO'
  AND "slug" = 'info-delivery'
  AND "excerpt" = 'Відправляємо замовлення день у день при оформленні до 18:00. Безкоштовно від 1 000 ₴.';
