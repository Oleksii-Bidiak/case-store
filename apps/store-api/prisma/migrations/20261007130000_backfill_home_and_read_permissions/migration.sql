-- ─────────────────────────────────────────────────────────────────────────────
-- `home:write` and the twelve `:read` keys, backfilled per PERSON and per
-- TEMPLATE (TASK-665 + the backfill half of TASK-666, plan 186, decision B-9).
--
-- WHAT. Two new kinds of key arrive in this wave:
--   - `home:write` — the homepage as a list of blocks. Before this wave the only
--     things anyone could change on `/` were its banners and its carousels
--     (`carousels:write` even decided which carousel was a «Популярне» tab and
--     which a rail — exactly what a homepage block decides now).
--   - `x:read` for categories, brands, devices, attributes, addons, discounts,
--     pages, blog, banners, carousels, faq and home. Until now those sections had
--     ONE key, and the nav and the GET routes required it, so a role either edited
--     a section or did not see it at all.
--
-- WHY A BACKFILL, AND WHY IT IS MANDATORY. Each new key carves something out of a
-- key people already hold. Shipped default-denied, the homepage would vanish from
-- every content manager who arranged it yesterday, and — the moment the nav and
-- the GET routes move to `:read` (cluster H2 of plan 186) — every one of these
-- sections would vanish for every manager. So each grant follows an existing one
-- one-for-one and adds no reach. `permission.catalog.spec.ts` pins the keys below
-- against HOME_BACKFILL_SOURCE_PERMISSIONS / HOME_PERMISSIONS / READ_BACKFILL_PAIRS.
--
-- ONE FILE, ORDERED STATEMENTS (plan 186 «Порядок і гілки»). Waves 180/181 shipped
-- two migrations that answered the same question in opposite ways. Here:
--   (a) `home:write`  ← `carousels:write` ∪ `banners:write`
--   (b) every `x:read` ← its `x:write`, the `home:write → home:read` pair LAST —
--       and (b) runs after (a), so whoever got `home:write` in (a) comes out
--       holding `home:read` too (step (c) of the plan, folded into the same
--       VALUES list rather than repeated).
-- Each step writes `user_permissions` and then `permission_template_items`; never
-- `role_permissions` (dropped by plan 181), and no role is named: ADMIN and the
-- owner hold every key by level, without a row.
--
-- PER PERSON — THE LESSON OF WAVE 180. A conditional backfill written against the
-- role matrix inserted zero rows on every database measured. This one reads and
-- writes the person; `test/read-permissions-backfill.int-spec.ts` replays this
-- file on real rows and asserts it actually inserted something.
--
-- Measured row counts, 2026-10-07 (`prisma migrate deploy`):
--   store_h1_measure (a copy of the seeded store_dev): user_permissions 1 → 1,
--     permission_template_items 0 → 0. The seed grants the MANAGER only
--     `orders:read`, none of the source keys — a no-op there. Counted, not assumed.
--   store_test: user_permissions 2 → 2, permission_template_items 0 → 0 (no-op).
--   store_h1_measure with a fixture (A: carousels:write; B: banners:write +
--     pages:write; C: categories:write + home:write; D: orders:read; template T1:
--     carousels:write + faq:write; T2: orders:read) before → after:
--       user_permissions          7 → 16 (A +3: home:write, home:read,
--         carousels:read; B +4: home:write, home:read, banners:read, pages:read;
--         C +2: categories:read, home:read [home:write already held]; D +0)
--       permission_template_items 3 → 7 (T1 +4: home:write, home:read,
--         carousels:read, faq:read; T2 +0)
--       per statement: (a) person 2, (a) template 1, (b) person 7, (b) template 3.
--     A second replay of the four statements: INSERT 0 0 in every one.
--   Invariants to re-check on any database after deploy (each must be 0):
--     SELECT COUNT(*) FROM user_permissions w
--      WHERE w.permission IN ('carousels:write', 'banners:write')
--        AND NOT EXISTS (SELECT 1 FROM user_permissions h
--                        WHERE h.user_id = w.user_id AND h.permission = 'home:write');
--     SELECT COUNT(*) FROM user_permissions w
--      WHERE w.permission LIKE '%:write'
--        AND w.permission IN ('categories:write', 'brands:write', 'devices:write',
--          'attributes:write', 'addons:write', 'discounts:write', 'pages:write',
--          'blog:write', 'banners:write', 'carousels:write', 'faq:write', 'home:write')
--        AND NOT EXISTS (SELECT 1 FROM user_permissions r WHERE r.user_id = w.user_id
--          AND r.permission = replace(w.permission, ':write', ':read'));
--
-- Idempotent in every statement (ON CONFLICT DO NOTHING): a restore-then-migrate
-- replays every file here.
-- ─────────────────────────────────────────────────────────────────────────────

-- (a) `home:write` for everyone who could change the homepage yesterday — person.
INSERT INTO "user_permissions" ("id", "user_id", "permission", "created_at", "updated_at")
SELECT
  gen_random_uuid()::text,
  eligible."user_id",
  new_key."permission",
  now(),
  now()
FROM (
  SELECT DISTINCT up."user_id"
  FROM "user_permissions" up
  WHERE up."permission" IN ('carousels:write', 'banners:write')
) AS eligible
CROSS JOIN (VALUES ('home:write')) AS new_key("permission")
ON CONFLICT ("user_id", "permission") DO NOTHING;

-- (a) … and template.
INSERT INTO "permission_template_items" ("id", "template_id", "permission", "created_at")
SELECT
  gen_random_uuid()::text,
  eligible."template_id",
  new_key."permission",
  now()
FROM (
  SELECT DISTINCT item."template_id"
  FROM "permission_template_items" item
  WHERE item."permission" IN ('carousels:write', 'banners:write')
) AS eligible
CROSS JOIN (VALUES ('home:write')) AS new_key("permission")
ON CONFLICT ("template_id", "permission") DO NOTHING;

-- (b) every `x:read` for the holders of its `x:write` — person. Runs after (a), so
-- the home pair also covers the `home:write` rows (a) just wrote.
INSERT INTO "user_permissions" ("id", "user_id", "permission", "created_at", "updated_at")
SELECT
  gen_random_uuid()::text,
  up."user_id",
  pair."read_key",
  now(),
  now()
FROM "user_permissions" up
JOIN (
  VALUES
    ('categories:write', 'categories:read'),
    ('brands:write', 'brands:read'),
    ('devices:write', 'devices:read'),
    ('attributes:write', 'attributes:read'),
    ('addons:write', 'addons:read'),
    ('discounts:write', 'discounts:read'),
    ('pages:write', 'pages:read'),
    ('blog:write', 'blog:read'),
    ('banners:write', 'banners:read'),
    ('carousels:write', 'carousels:read'),
    ('faq:write', 'faq:read'),
    ('home:write', 'home:read')
) AS pair("write_key", "read_key") ON pair."write_key" = up."permission"
ON CONFLICT ("user_id", "permission") DO NOTHING;

-- (b) … and template.
INSERT INTO "permission_template_items" ("id", "template_id", "permission", "created_at")
SELECT
  gen_random_uuid()::text,
  item."template_id",
  pair."read_key",
  now()
FROM "permission_template_items" item
JOIN (
  VALUES
    ('categories:write', 'categories:read'),
    ('brands:write', 'brands:read'),
    ('devices:write', 'devices:read'),
    ('attributes:write', 'attributes:read'),
    ('addons:write', 'addons:read'),
    ('discounts:write', 'discounts:read'),
    ('pages:write', 'pages:read'),
    ('blog:write', 'blog:read'),
    ('banners:write', 'banners:read'),
    ('carousels:write', 'carousels:read'),
    ('faq:write', 'faq:read'),
    ('home:write', 'home:read')
) AS pair("write_key", "read_key") ON pair."write_key" = item."permission"
ON CONFLICT ("template_id", "permission") DO NOTHING;
