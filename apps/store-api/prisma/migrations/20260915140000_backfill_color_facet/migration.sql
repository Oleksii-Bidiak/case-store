-- ─────────────────────────────────────────────────────────────────────────────
-- Colour becomes a real catalogue facet on databases that already exist
-- (TASK-487, plan 182 / owner decision B-10).
--
-- WHY A MIGRATION AND NOT JUST THE SEED. Colour has always been in this schema,
-- in the one column the facet machinery cannot read: `products.attributes`, the
-- free-form JSON that carries a position's VARIANT AXIS values. Facets filter
-- through `product_attribute_values` bound to an `attribute_definitions` row,
-- and there was no colour definition anywhere — which is exactly why
-- `?specs=color:…` and `GET /categories/:id/filterable-specs` could not see a
-- colour that every product card was already painting a swatch for.
--
-- The seed now writes both sides (see `prisma/seed/seeders/attributes.seeder.ts`),
-- but a seed only ever runs on a fresh database. The client's stand is not
-- fresh: it carries a catalogue somebody imported and edited by hand, and
-- re-seeding it would destroy that. `prisma migrate deploy` is the only thing
-- that runs by itself on that machine, so the backfill lives here.
--
-- WHAT IT REFUSES TO ASSUME. It does not look up category slugs. A slug list
-- ('cases', 'headphones', …) would be a copy of the seed's own tree, and would
-- match NOTHING on a shop whose categories were renamed or built by hand — the
-- silent no-op this project has already shipped twice (see
-- 20260915130000_backfill_returns_permissions_per_user for the last one). It
-- asks the DATA instead: every category that holds a coloured product resolves
-- to its ROOT, and the colour facet is declared there. Definitions live on the
-- root because that is where the inheritance in
-- `AttributeDefinitionRepository.findEffectiveForCategory` reads them from —
-- one declared on a leaf would be invisible while browsing the parent.
--
-- IDEMPOTENT in both halves: the definition upserts on `(category_id, key)` and
-- merges option lists rather than replacing them, and a product that already
-- carries a colour spec value is skipped entirely, so re-running this changes
-- nothing and it can never fight an operator's later edit.

-- ── 1. Declare the colour facet on every root that has colours, and fill in
--       the missing values in one pass. ──────────────────────────────────────
WITH RECURSIVE ancestry(category_id, node_id, parent_id, depth) AS (
    SELECT c.id, c.id, c.parent_id, 0
    FROM categories c
  UNION ALL
    -- `depth < 16` is a seatbelt, not a business rule: the category tree is
    -- acyclic by intent but not by constraint, and a cycle here would be an
    -- infinite recursion inside a deploy. The real tree is 2 levels deep.
    SELECT a.category_id, p.id, p.parent_id, a.depth + 1
    FROM ancestry a
    JOIN categories p ON p.id = a.parent_id
    WHERE a.depth < 16
),
category_root AS (
  SELECT category_id, node_id AS root_id
  FROM ancestry
  WHERE parent_id IS NULL
),
product_colors AS (
  -- The axis is matched by NAME, case-insensitively, against the same three
  -- spellings `src/common/color-axis.ts` owns for the application. The extra
  -- exact-match arm is insurance: `lower()` on Cyrillic depends on the
  -- database's collation, and this statement runs on a machine nobody is
  -- watching.
  SELECT p.id AS product_id,
         p.category_id,
         btrim(kv.value #>> '{}') AS color
  FROM products p
  CROSS JOIN LATERAL jsonb_each(
    CASE WHEN jsonb_typeof(p.attributes) = 'object' THEN p.attributes ELSE '{}'::jsonb END
  ) AS kv(key, value)
  WHERE p.deleted_at IS NULL
    AND (
      lower(btrim(kv.key)) IN ('color', 'colour', 'колір')
      OR btrim(kv.key) IN ('Колір', 'Color', 'Colour')
    )
    AND jsonb_typeof(kv.value) = 'string'
    AND btrim(kv.value #>> '{}') <> ''
),
target_roots AS (
  SELECT cr.root_id,
         jsonb_agg(DISTINCT pc.color ORDER BY pc.color) AS opts
  FROM product_colors pc
  JOIN category_root cr ON cr.category_id = pc.category_id
  GROUP BY cr.root_id
),
pending AS (
  -- DISTINCT ON: a row carrying BOTH `color` and «Колір» would otherwise be
  -- inserted twice under one definition and abort the statement.
  SELECT DISTINCT ON (pc.product_id) pc.product_id, cr.root_id, pc.color
  FROM product_colors pc
  JOIN category_root cr ON cr.category_id = pc.category_id
  WHERE NOT EXISTS (
    SELECT 1
    FROM product_attribute_values v
    JOIN attribute_definitions d ON d.id = v.definition_id
    WHERE v.product_id = pc.product_id
      AND d.key = 'color'
  )
  ORDER BY pc.product_id, pc.color
),
ensured AS (
  INSERT INTO attribute_definitions (id, category_id, key, label, type, options, is_filterable, sort_order)
  SELECT gen_random_uuid()::text,
         tr.root_id,
         'color',
         'Колір',
         'SELECT'::"AttributeType",
         tr.opts,
         true,
         -- Strictly first without renumbering anything an admin may have
         -- ordered by hand. Colour is the strongest facet in accessories
         -- (B-10) and the sidebar shows facets in `sort_order`, capped at six.
         COALESCE(
           (SELECT MIN(d.sort_order) - 1 FROM attribute_definitions d WHERE d.category_id = tr.root_id),
           0
         )
  FROM target_roots tr
  ON CONFLICT (category_id, key) DO UPDATE
    SET type = 'SELECT'::"AttributeType",
        is_filterable = true,
        -- MERGE, never replace: the seed may have written a richer option list
        -- than the products currently in stock can account for, and dropping an
        -- option makes a colour unpickable in the admin spec editor.
        options = (
          SELECT jsonb_agg(DISTINCT opt ORDER BY opt)
          FROM jsonb_array_elements_text(
            CASE
              WHEN jsonb_typeof(attribute_definitions.options) = 'array' THEN attribute_definitions.options
              ELSE '[]'::jsonb
            END || EXCLUDED.options
          ) AS merged(opt)
        )
  RETURNING id, category_id
)
INSERT INTO product_attribute_values (id, product_id, definition_id, value)
SELECT gen_random_uuid()::text, pd.product_id, e.id, pd.color
FROM pending pd
JOIN ensured e ON e.category_id = pd.root_id
ON CONFLICT (product_id, definition_id) DO NOTHING;

-- ── 2. Promote colour definitions the XLSX import created. ──────────────────
-- `CatalogImportRepository.ensureAttributeDefinitions` types every column it
-- meets as TEXT and never filterable, on purpose (the source columns mix "до
-- 20м" with "5"). For colour that default is wrong: a TEXT definition is never
-- offered as a facet, so an imported catalogue would carry colour values nobody
-- can filter by. The import writes SELECT itself from now on; this fixes the
-- rows it already wrote.
UPDATE attribute_definitions
SET type = 'SELECT'::"AttributeType",
    is_filterable = true,
    label = CASE WHEN lower(btrim(label)) IN ('color', 'colour', '') THEN 'Колір' ELSE label END
WHERE key = 'color'
  AND (type <> 'SELECT'::"AttributeType" OR is_filterable = false);

-- ── 3. Make every colour definition's option list cover the values in use. ──
-- A SELECT is a CLOSED dropdown in the admin spec editor. A value that exists
-- on a product but not in `options` is a colour an operator can see on the
-- storefront and cannot re-pick in the panel — so the list is widened to the
-- union of what it already declared and what is actually stored.
UPDATE attribute_definitions d
SET options = u.opts
FROM (
  SELECT d2.id,
         (
           SELECT jsonb_agg(DISTINCT opt ORDER BY opt)
           FROM jsonb_array_elements_text(
             CASE
               WHEN jsonb_typeof(d2.options) = 'array' THEN d2.options
               ELSE '[]'::jsonb
             END
             || COALESCE(
                  (SELECT jsonb_agg(v.value) FROM product_attribute_values v WHERE v.definition_id = d2.id),
                  '[]'::jsonb
                )
           ) AS merged(opt)
         ) AS opts
  FROM attribute_definitions d2
  WHERE d2.key = 'color'
) u
WHERE d.id = u.id
  AND u.opts IS NOT NULL
  AND u.opts <> COALESCE(d.options, '[]'::jsonb);
