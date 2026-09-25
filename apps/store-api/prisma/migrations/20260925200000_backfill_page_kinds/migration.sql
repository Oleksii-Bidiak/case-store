-- ─────────────────────────────────────────────────────────────────────────────
-- Give pages the kinds they would have had, on databases created before
-- wave 176 (TASK-733, plan 193).
--
-- THE DEFECT. `20260912150718_add_page_kind` added `pages.kind` with
-- `DEFAULT 'LEGAL'` and no backfill. That was right for the page URLs (every
-- row had lived at `/legal/<slug>`), but it left an old database in a state the
-- seed never produces: «Про нас» (`about`, INFO in `pages.data.ts`) still
-- served under `/legal/about` and listed in the footer's legal column, and not
-- a single HUB row — the demo stand's content map read «Довідкові 0 / Хаби 0»
-- on 2026-09-17, and the six listing hubs had no owner-editable meta tags.
-- The seed would repair it, but a seed never runs on a stand that carries
-- hand-edited content; `prisma migrate deploy` is the only thing that does.
--
-- WHAT IT DOES
--   1. `about` LEGAL → INFO. Only a row still carrying the column default is
--      moved; one already INFO is left alone. `/legal/about` keeps working: the
--      storefront 308s a page whose kind changed to its new address
--      (`resolvePageRedirect`). Trade-off, stated: an owner who DELIBERATELY set
--      `about` back to LEGAL after wave 176 (the legal checklist allows it) is
--      indistinguishable from the default and is moved once more; the kind is
--      one select away in the panel.
--   2. The six HUB rows (`categories`, `blog`, `legal`, `contact`, `info`,
--      `promo` — `src/pages/hub-routes.ts`) are INSERTED where missing, with the
--      seed's texts and the store name from the `seo_settings` singleton
--      (`SINGLETON_ID` in seo-settings.repository.ts; fallback 'CaseStore',
--      the storefront's `SITE_NAME`). A `meta_title` is
--      always written: a HUB row without one would put its admin label
--      («Розділ «Блог»») into the SERP title, which is worse than no row.
--
-- WHAT IT REFUSES TO DO
--   • It never turns an EXISTING row into a HUB. Before wave 176 no code wrote
--     a hub slug, so a pre-existing `promo`/`contact`/… row is a document an
--     operator wrote at `/legal/<slug>`. Promoting it would hide it from its
--     URL and make its body dead text — the exact loss `pages.seeder.ts`
--     refuses for the same reason. Its kind, title and body are left alone.
--   • It never overwrites an existing HUB row (an owner's edited meta wins).
--   • It inserts nothing into an EMPTY `pages` table. That is a database being
--     built from scratch: the seed supplies the hubs there, and a production
--     bootstrap without a seed keeps the dictionary fallback, which follows a
--     later rename of the store — a row frozen here would not.
--
-- CORRECT EITHER SIDE OF THE (kind, slug) UNIQUENESS CHANGE (TASK-566). While
-- `slug` is unique on its own, a hub is inserted only if NO row holds its slug
-- (an operator's LEGAL `promo` then blocks the `promo` hub: the insert would
-- violate the constraint). Once uniqueness is per kind, only an existing HUB
-- row with that slug blocks it, and the hub is inserted beside the document.
-- The statement asks the catalogue which of the two is in force rather than
-- relying on migration order; `ON CONFLICT (slug)` would be wrong after the
-- change, so it is not used.
--
-- IDEMPOTENT: re-running it changes nothing.
--
-- ROW COUNTS (pages, by kind; measured on store_test_193 inside a rolled-back
-- transaction over the pre-wave-176 seed shape — `about` + 6 legal documents,
-- all LEGAL — plus an operator-authored LEGAL `promo`):
--   before: total 8  — LEGAL 8, INFO 0, HUB 0
--   after:  total 13 — LEGAL 7, INFO 1, HUB 5   (`promo` hub blocked by the
--           operator's `promo` document while slug is globally unique)
--   the same shape without the operator's `promo`:
--   before: total 7  — LEGAL 7, INFO 0, HUB 0
--   after:  total 13 — LEGAL 6, INFO 1, HUB 6
--   store_test_193 itself (empty `pages`): before 0, after 0.
-- Proven by test/page-kind-backfill.int-spec.ts, which executes this file.
--
-- No statement below contains `;` inside a string literal — the int-spec
-- splits the file on it.

-- ── 1. «Про нас» becomes the INFO page the seed always made it. ────────────
UPDATE "pages"
SET "kind" = 'INFO', "updated_at" = CURRENT_TIMESTAMP
WHERE "slug" = 'about'
  AND "kind" = 'LEGAL'
  AND NOT EXISTS (
    SELECT 1 FROM "pages" AS info_about
    WHERE info_about."slug" = 'about' AND info_about."kind" = 'INFO'
  );

-- ── 2. The six listing hubs get their owner-editable meta rows. ──────────────
INSERT INTO "pages" (
  "id", "slug", "kind", "title", "content", "excerpt", "meta_title",
  "meta_description", "status", "published_at", "is_active", "sort_order",
  "updated_at"
)
SELECT
  gen_random_uuid()::text,
  hub.slug,
  'HUB'::"PageKind",
  hub.title,
  hub.content,
  hub.excerpt,
  hub.meta_title_prefix || ' | ' || COALESCE(
    (SELECT NULLIF(btrim(s."site_name"), '') FROM "seo_settings" AS s
     WHERE s."id" = '00000000-0000-0000-0000-000000000002'),
    'CaseStore'
  ),
  hub.meta_description,
  'PUBLISHED'::"PublishStatus",
  CURRENT_TIMESTAMP,
  true,
  hub.sort_order,
  CURRENT_TIMESTAMP
FROM (VALUES
  ('categories', 'Розділ «Категорії»',
   'SEO-заголовок і опис для сторінки зі списком категорій.',
   'Категорії товарів',
   'Усі категорії магазину в одному списку — оберіть розділ і перейдіть до товарів у ньому.',
   '<p>Це не окрема сторінка сайту, а SEO-картка розділу <strong>/categories</strong>: тут задаються заголовок і опис, які бачить Google і які показуються у прев''ю посилання. Сам список категорій формується автоматично.</p>',
   7),
  ('blog', 'Розділ «Блог»',
   'SEO-заголовок і опис для стрічки блогу.',
   'Блог',
   'Огляди, гайди та поради про смартфони, аксесуари й техніку — статті команди магазину.',
   '<p>Це не окрема сторінка сайту, а SEO-картка розділу <strong>/blog</strong>: тут задаються заголовок і опис, які бачить Google і які показуються у прев''ю посилання. Самі статті редагуються в розділі «Блог».</p>',
   8),
  ('legal', 'Розділ «Правова інформація»',
   'SEO-заголовок і опис для списку правових документів.',
   'Правова інформація',
   'Офіційні документи магазину в одному місці: політики, умови та оферта. Оберіть документ, щоб прочитати повну редакцію.',
   '<p>Це не окрема сторінка сайту, а SEO-картка розділу <strong>/legal</strong>: тут задаються заголовок і опис, які бачить Google і які показуються у прев''ю посилання. Самі документи — це сторінки виду «Юридична» у цьому ж розділі.</p>',
   9),
  ('contact', 'Розділ «Контакти»',
   'SEO-заголовок і опис для сторінки контактів.',
   'Контакти',
   'Телефон, пошта та месенджери магазину — оберіть зручний спосіб звʼязатися з нами.',
   '<p>Це не окрема сторінка сайту, а SEO-картка розділу <strong>/contact</strong>: тут задаються заголовок і опис, які бачить Google і які показуються у прев''ю посилання. Самі контакти редагуються в «Налаштування → Контакти».</p>',
   10),
  ('info', 'Розділ «Інформація та підтримка»',
   'SEO-заголовок і опис для довідкового розділу.',
   'Інформація та підтримка',
   'Доставка й оплата, гарантія та сервіс, часті питання і контакти — усе про роботу магазину в одному розділі.',
   '<p>Це не окрема сторінка сайту, а SEO-картка розділу <strong>/info</strong>: тут задаються заголовок і опис, які бачить Google і які показуються у прев''ю посилання. Текст самого розділу — це сторінки виду «Довідкова» та блок FAQ.</p>',
   11),
  ('promo', 'Розділ «Акції»',
   'SEO-заголовок і опис для сторінки акцій.',
   'Акції та знижки',
   'Товари зі знижкою та поточні промокоди магазину — усі діючі пропозиції в одному розділі.',
   '<p>Це не окрема сторінка сайту, а SEO-картка розділу <strong>/promo</strong>: тут задаються заголовок і опис, які бачить Google і які показуються у прев''ю посилання. Самі акційні добірки формуються зі знижок і банерів.</p>',
   12)
) AS hub(slug, title, excerpt, meta_title_prefix, meta_description, content, sort_order)
-- An empty table is a database being built from scratch — see the header.
WHERE EXISTS (SELECT 1 FROM "pages")
  AND NOT EXISTS (
    SELECT 1 FROM "pages" AS existing
    WHERE existing."slug" = hub.slug
      AND (
        existing."kind" = 'HUB'
        -- Is `slug` still unique on its own? Then ANY row holding it blocks
        -- the insert. Read from the catalogue, so the answer is right whichever
        -- side of the (kind, slug) change this runs on.
        OR EXISTS (
          SELECT 1
          FROM pg_index AS idx
          JOIN pg_attribute AS col
            ON col.attrelid = idx.indrelid AND col.attnum = idx.indkey[0]
          WHERE idx.indrelid = '"pages"'::regclass
            AND idx.indisunique
            AND idx.indnatts = 1
            AND col.attname = 'slug'
        )
      )
  );
