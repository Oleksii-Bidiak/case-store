-- ─────────────────────────────────────────────────────────────────────────────
-- Give the /info hub's hardcoded blocks the CMS pages they now render from
-- (TASK-560, plan 196).
--
-- THE DEFECT. Only «Про нас» on /info came from the CMS (TASK-435). Delivery,
-- payment, warranty and the «in numbers / why us» block were constants in
-- `apps/store-client/src/widgets/info-support/model/info-content.ts` — text the
-- owner could see on the site and edit nowhere, with `[bracketed placeholders]`
-- (TASK-311) nobody could fill in without a developer. The storefront now reads
-- each block from an INFO page (slugs in the storefront's
-- `shared/config/hub-pages.ts`, `INFO_HUB_SECTION_SLUGS`).
--
-- WHAT IT DOES
--   Inserts four PUBLISHED INFO pages holding EXACTLY the text the constants
--   held on the day they were removed, so a stand looks the same before and
--   after the deploy and the owner edits from where the page already was:
--     info-delivery     «Доставка»
--     info-payment      «Оплата»
--     info-warranty     «Гарантія та сервіс»
--     info-about-stats  «Про нас у цифрах» (the numbers and «Чому обирають нас»)
--   `meta_title` carries the store name from the `seo_settings` singleton
--   (fallback 'CaseStore'), the same rule as 20260925200000_backfill_page_kinds.
--   `sort_order` continues after the last existing row, so the /legal hub's
--   order is untouched.
--
-- WHAT IT REFUSES TO DO
--   • It never touches an existing INFO page with one of those slugs — an
--     owner who already wrote one keeps theirs, title and body.
--   • It inserts nothing into an EMPTY `pages` table: that is a database being
--     built from scratch, and the seed (`pages.data.ts`) supplies the same four
--     rows there.
--   (The services list is NOT a page: it comes from the active add-on services
--   with their real prices — TASK-561.)
--
-- Slugs are unique per kind since 20260925100100_page_slug_per_kind (TASK-566),
-- so only an INFO row can block an insert.
--
-- IDEMPOTENT: re-running it changes nothing.
--
-- No statement below contains `;` inside a string literal — the int-spec
-- (`test/info-pages-backfill.int-spec.ts`) splits the file on it.

INSERT INTO "pages" (
  "id", "slug", "kind", "title", "content", "excerpt", "meta_title",
  "meta_description", "status", "published_at", "is_active", "sort_order",
  "updated_at"
)
SELECT
  gen_random_uuid()::text,
  section.slug,
  'INFO'::"PageKind",
  section.title,
  section.content,
  section.excerpt,
  section.title || ' | ' || COALESCE(
    (SELECT NULLIF(btrim(s."site_name"), '') FROM "seo_settings" AS s
     WHERE s."id" = '00000000-0000-0000-0000-000000000002'),
    'CaseStore'
  ),
  section.meta_description,
  'PUBLISHED'::"PublishStatus",
  CURRENT_TIMESTAMP,
  true,
  (SELECT COALESCE(MAX(p."sort_order"), -1) FROM "pages" AS p) + section.position,
  CURRENT_TIMESTAMP
FROM (VALUES
  ('info-delivery', 'Доставка',
   'Відправляємо замовлення день у день при оформленні до 18:00. Безкоштовно від 1 000 ₴.',
   'Як ми доставляємо замовлення: Нова Пошта по всій Україні, курʼєр по місту, самовивіз.',
   '<ul><li><p><strong>Нова Пошта</strong> — відділення або поштомат по всій Україні. Вартість: за тарифом НП.</p></li><li><p><strong>Курʼєр по місту</strong> — [міста курʼєрської доставки] — доставка в день замовлення. Вартість: [вартість].</p></li><li><p><strong>Самовивіз</strong> — [адреса пункту самовивозу]. Безкоштовно.</p></li></ul>',
   1),
  ('info-payment', 'Оплата',
   'Обирайте зручний спосіб — онлайн або при отриманні.',
   'Способи оплати замовлення: при отриманні або карткою онлайн.',
   '<ul><li><p><strong>При отриманні</strong> — готівкою або карткою у відділенні Нової Пошти.</p></li><li><p><strong>Картка онлайн</strong> — [платіжний провайдер: підключити перед запуском].</p></li><li><p><strong>Безпечна оплата</strong> — дані картки не зберігаються на сайті.</p></li></ul>',
   2),
  ('info-warranty', 'Гарантія та сервіс',
   'Уся техніка — офіційна, з гарантією виробника. Сервісне обслуговування — [сервісний центр / партнер].',
   'Гарантія виробника, повернення протягом 14 днів і сервісне обслуговування.',
   '<ul><li><p><strong>12–24 місяці гарантії</strong> — офіційна гарантія виробника на всю техніку.</p></li><li><p><strong>14 днів на повернення</strong> — повернення товару належної якості без пояснень.</p></li><li><p><strong>100% оригінальна техніка</strong> — сервісне обслуговування — [сервісний центр / партнер].</p></li></ul>',
   3),
  ('info-about-stats', 'Про нас у цифрах',
   NULL,
   'Магазин у цифрах і чому його обирають.',
   '<ul><li><p><strong>[N]</strong> років на ринку</p></li><li><p><strong>[N]</strong> товарів у каталозі</p></li><li><p><strong>[N]</strong> клієнтів</p></li><li><p><strong>[N]</strong> середня оцінка</p></li></ul><h2>Чому обирають нас</h2><ul><li><p><strong>Тільки оригінал</strong> — офіційні постачальники, жодних сірих пристроїв.</p></li><li><p><strong>Чесні ціни</strong> — без прихованих доплат і накруток.</p></li><li><p><strong>Швидка доставка</strong> — відправка день у день по всій Україні.</p></li><li><p><strong>Підтримка</strong> — допоможемо з вибором та після покупки: [графік роботи підтримки].</p></li></ul>',
   4)
) AS section(slug, title, excerpt, meta_description, content, position)
-- An empty table is a database being built from scratch — see the header.
WHERE EXISTS (SELECT 1 FROM "pages")
  AND NOT EXISTS (
    SELECT 1 FROM "pages" AS existing
    WHERE existing."slug" = section.slug
      AND existing."kind" = 'INFO'
  );
