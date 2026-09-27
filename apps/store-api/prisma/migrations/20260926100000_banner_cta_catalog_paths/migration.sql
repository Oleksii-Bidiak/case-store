-- TASK-836 (SF-UX-13): banner CTAs pointing at a bare `/catalog`.
--
-- The storefront has never served `/catalog` without segments — the catalogue
-- is `/products`, and `/catalog/<category>/<device>` is the only route under
-- that prefix. The first seed nevertheless wrote the home banners' CTAs as
-- `/catalog`, `/catalog?sale=true` and `/catalog?category=<old slug>`, and
-- `next/link` prefetches every banner href: each home-page load logged
-- `GET /catalog?_rsc=… 404`. The seed was corrected (e3a103df), but a database
-- seeded before that — the demo stand — still holds the old rows.
--
-- Data only, no schema change. Each statement matches EXACT legacy spellings,
-- so a valid `/catalog/<category>/<device>` CTA is never touched, and re-running
-- the file is a no-op. The known seed values map to exactly what the corrected
-- seed writes; anything else under `/catalog?…` keeps its query on `/products`
-- (the storefront's bare-`/catalog` route does the same at request time for
-- whatever this cannot know about).

-- The deals CTA → the deals landing.
UPDATE "banners" SET "cta_href" = '/promo', "updated_at" = NOW()
WHERE "cta_href" = '/catalog?sale=true';

-- The three category CTAs of the first seed → the categories the corrected seed links.
UPDATE "banners" SET "cta_href" = '/categories/headphones', "updated_at" = NOW()
WHERE "cta_href" = '/catalog?category=audio';

UPDATE "banners" SET "cta_href" = '/categories/screen-protectors', "updated_at" = NOW()
WHERE "cta_href" = '/catalog?category=protection';

UPDATE "banners" SET "cta_href" = '/categories/power-banks', "updated_at" = NOW()
WHERE "cta_href" = '/catalog?category=power';

-- The bare catalogue CTA → the catalogue.
UPDATE "banners" SET "cta_href" = '/products', "updated_at" = NOW()
WHERE "cta_href" IN ('/catalog', '/catalog/');

-- Any other bare-`/catalog` query → the same query on `/products`
-- ('/catalog?' is 9 characters, so the query starts at position 10).
UPDATE "banners" SET "cta_href" = '/products?' || substring("cta_href" FROM 10), "updated_at" = NOW()
WHERE "cta_href" LIKE '/catalog?%';
