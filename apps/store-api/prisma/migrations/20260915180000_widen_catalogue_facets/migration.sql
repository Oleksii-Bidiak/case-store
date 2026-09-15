-- ─────────────────────────────────────────────────────────────────────────────
-- The catalogue facet set widens to the market list on databases that already
-- exist (TASK-488, plan 182 / owner decision B-10).
--
-- WHY A MIGRATION AND NOT JUST THE SEED. `npm run db:seed` never runs on the
-- client's stand — it would destroy the catalogue somebody imported and edited
-- by hand. `prisma migrate deploy` is the only thing that runs there by itself,
-- so everything the seed now declares has to be reproduced here for a database
-- whose rows predate it. Four things happen:
--
--   1. attributes that were already FILLED IN become facets — MagSafe (чохли),
--      ANC (навушники), технологія (зарядки);
--   2. «кількість портів» and «твердість» become facets too, which first means
--      RETYPING them: a facet is a SELECT or a BOOLEAN and never a NUMBER or a
--      TEXT (B-10), and «Твердість» held «9H, товщина 0.33 мм» — a class and a
--      thickness in one string, which as a facet would offer one value per
--      product. The class is split out; the remainder moves to a new TEXT
--      «Особливості» so nothing the PDP used to show is lost;
--   3. the three definitions the market has and we lacked are declared:
--      «Вихідний роз'єм» (зарядки), «Мікрофон» (навушники), «Комплектація»
--      (чохли);
--   4. anything still flagged filterable that CANNOT be a facet is unflagged.
--
-- WHAT IT REFUSES TO ASSUME. Like 20260915140000_backfill_color_facet, it never
-- looks up a category by SLUG. A slug list would be a copy of the seed's tree
-- and would match NOTHING on a shop whose categories were renamed or built by
-- hand — the silent no-op this repository has shipped twice already. It asks
-- the DATA instead, through the one thing that is a stable contract: the
-- definition KEY (it is half of the `(category_id, key)` unique and it is what
-- `?specs=key:value` puts in the URL). The category that declares `case-type`
-- IS the cases root, whatever it is called today.
--
-- IDEMPOTENT throughout: every statement is guarded by the state it changes
-- (`type = 'NUMBER'`, `is_filterable = false`, `ON CONFLICT DO NOTHING`), so a
-- second run writes nothing and cannot fight an operator's later edit.

-- ── 1. Promote the attributes that were filled in but never flagged. ────────
-- The type guard is what keeps this honest: `ports` on a POWER BANK is a TEXT
-- «Роз'єми» holding «USB-C + 2×USB-A», and it must NOT become a facet. Only
-- rows that are already a SELECT or a BOOLEAN are promoted here; `ports` and
-- `hardness` earn their promotion in steps 2 and 3, after being retyped.
UPDATE attribute_definitions
SET is_filterable = true
WHERE key IN ('magsafe', 'anc', 'technology')
  AND is_filterable = false
  AND type IN ('SELECT'::"AttributeType", 'BOOLEAN'::"AttributeType");

-- ── 2. «Кількість портів»: NUMBER → SELECT, then a facet. ──────────────────
-- The stored values ('1', '2', …) do not change, so the PDP row is untouched;
-- the definition gains the closed option list that makes it usable both as an
-- admin dropdown and as a sidebar control. Skipped when nothing carries the
-- spec — a SELECT with an empty option list is a dropdown nobody can pick from.
UPDATE attribute_definitions d
SET type = 'SELECT'::"AttributeType",
    is_filterable = true,
    options = (
      SELECT jsonb_agg(DISTINCT v.value ORDER BY v.value)
      FROM product_attribute_values v
      WHERE v.definition_id = d.id
    )
WHERE d.key = 'ports'
  AND d.type = 'NUMBER'::"AttributeType"
  AND EXISTS (SELECT 1 FROM product_attribute_values v WHERE v.definition_id = d.id);

-- ── 3. «Твердість»: split the class out of the free text, then promote. ────
-- 3a. The new TEXT home for the descriptive half, on every category that
--     declares a TEXT hardness. Appended to the end of that category's list so
--     no hand-made ordering is renumbered.
INSERT INTO attribute_definitions (id, category_id, key, label, type, is_filterable, sort_order)
SELECT gen_random_uuid()::text,
       d.category_id,
       'protector-features',
       'Особливості',
       'TEXT'::"AttributeType",
       false,
       COALESCE(
         (SELECT MAX(d2.sort_order) + 1 FROM attribute_definitions d2 WHERE d2.category_id = d.category_id),
         0
       )
FROM attribute_definitions d
WHERE d.key = 'hardness'
  AND d.type = 'TEXT'::"AttributeType"
ON CONFLICT (category_id, key) DO NOTHING;

-- 3b. Move the remainder («товщина 0.33 мм», «суцільна пластина», or the whole
--     string when there is no hardness class at all) to «Особливості», first
--     letter capitalised so it reads as its own value.
INSERT INTO product_attribute_values (id, product_id, definition_id, value)
SELECT gen_random_uuid()::text,
       s.product_id,
       f.id,
       upper(left(s.remainder, 1)) || substring(s.remainder from 2)
FROM (
  SELECT v.product_id,
         d.category_id,
         CASE
           WHEN substring(btrim(v.value) from '^[0-9]+H') IS NOT NULL
             THEN btrim(regexp_replace(btrim(v.value), '^[0-9]+H[[:space:]]*,?[[:space:]]*', ''))
           ELSE btrim(v.value)
         END AS remainder
  FROM product_attribute_values v
  JOIN attribute_definitions d
    ON d.id = v.definition_id
   AND d.key = 'hardness'
   AND d.type = 'TEXT'::"AttributeType"
) s
JOIN attribute_definitions f
  ON f.category_id = s.category_id
 AND f.key = 'protector-features'
WHERE s.remainder <> ''
ON CONFLICT (product_id, definition_id) DO NOTHING;

-- 3c. Reduce the hardness value itself to the class.
UPDATE product_attribute_values v
SET value = substring(btrim(v.value) from '^[0-9]+H')
FROM attribute_definitions d
WHERE d.id = v.definition_id
  AND d.key = 'hardness'
  AND d.type = 'TEXT'::"AttributeType"
  AND substring(btrim(v.value) from '^[0-9]+H') IS NOT NULL
  AND v.value <> substring(btrim(v.value) from '^[0-9]+H');

-- 3d. A protector with no hardness class (a hydrogel film) has no hardness —
--     its text is safe in «Особливості» now, and an empty-ish value in a facet
--     is worse than no value.
DELETE FROM product_attribute_values v
USING attribute_definitions d
WHERE d.id = v.definition_id
  AND d.key = 'hardness'
  AND d.type = 'TEXT'::"AttributeType"
  AND substring(btrim(v.value) from '^[0-9]+H') IS NULL;

-- 3e. Now it can be a facet.
UPDATE attribute_definitions d
SET type = 'SELECT'::"AttributeType",
    is_filterable = true,
    options = (
      SELECT jsonb_agg(DISTINCT v.value ORDER BY v.value)
      FROM product_attribute_values v
      WHERE v.definition_id = d.id
    )
WHERE d.key = 'hardness'
  AND d.type = 'TEXT'::"AttributeType"
  AND EXISTS (SELECT 1 FROM product_attribute_values v WHERE v.definition_id = d.id);

-- ── 4. Declare the three definitions the market has and we lacked. ─────────
-- Each is attached to the category that declares its SIBLING key, which is how
-- this file recognises «Зарядки» / «Навушники» / «Чохли» without naming them.
-- They arrive EMPTY except for step 4d: an existing shop's products carry no
-- bundle contents or microphone placement anywhere for SQL to derive them from,
-- and inventing a value would be worse than an operator filling it in. A facet
-- with no values is not rendered at all (`getFilterableSpecs` drops it), so the
-- sidebar stays honest until someone fills them.
INSERT INTO attribute_definitions (id, category_id, key, label, type, options, is_filterable, sort_order)
SELECT gen_random_uuid()::text,
       d.category_id,
       'charger-output',
       'Вихідний роз''єм',
       'SELECT'::"AttributeType",
       '["USB-C", "USB-A", "USB-C + USB-A", "Lightning", "Бездротовий"]'::jsonb,
       true,
       COALESCE(
         (SELECT MAX(d2.sort_order) + 1 FROM attribute_definitions d2 WHERE d2.category_id = d.category_id),
         0
       )
FROM attribute_definitions d
WHERE d.key = 'charger-type'
ON CONFLICT (category_id, key) DO NOTHING;

INSERT INTO attribute_definitions (id, category_id, key, label, type, options, is_filterable, sort_order)
SELECT gen_random_uuid()::text,
       d.category_id,
       'microphone',
       'Мікрофон',
       'SELECT'::"AttributeType",
       '["Вбудований", "На кабелі", "Немає"]'::jsonb,
       true,
       COALESCE(
         (SELECT MAX(d2.sort_order) + 1 FROM attribute_definitions d2 WHERE d2.category_id = d.category_id),
         0
       )
FROM attribute_definitions d
WHERE d.key = 'headphone-type'
ON CONFLICT (category_id, key) DO NOTHING;

INSERT INTO attribute_definitions (id, category_id, key, label, type, options, is_filterable, sort_order)
SELECT gen_random_uuid()::text,
       d.category_id,
       'bundle',
       'Комплектація',
       'SELECT'::"AttributeType",
       '["Лише чохол", "Чохол + захисне скло", "Чохол + скло на камеру", "Чохол + ремінець"]'::jsonb,
       true,
       COALESCE(
         (SELECT MAX(d2.sort_order) + 1 FROM attribute_definitions d2 WHERE d2.category_id = d.category_id),
         0
       )
FROM attribute_definitions d
WHERE d.key = 'case-type'
ON CONFLICT (category_id, key) DO NOTHING;

-- 4d. The one output connector that IS derivable: a wireless charger has no
--     output socket, and «Бездротовий» is a real answer to «яким роз'ємом
--     заряджає». Everything else would be a guess about a product.
INSERT INTO product_attribute_values (id, product_id, definition_id, value)
SELECT gen_random_uuid()::text, v.product_id, o.id, 'Бездротовий'
FROM product_attribute_values v
JOIN attribute_definitions t
  ON t.id = v.definition_id
 AND t.key = 'charger-type'
JOIN attribute_definitions o
  ON o.category_id = t.category_id
 AND o.key = 'charger-output'
WHERE btrim(v.value) = 'Бездротова'
ON CONFLICT (product_id, definition_id) DO NOTHING;

-- ── 5. Widen the option lists of the definitions this file touched. ────────
-- A SELECT is a CLOSED dropdown in the admin spec editor: a value stored on a
-- product but missing from `options` is one an operator can see on the
-- storefront and cannot re-pick. Union, never replace.
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
  WHERE d2.type = 'SELECT'::"AttributeType"
    AND d2.key IN ('technology', 'ports', 'hardness', 'charger-output', 'microphone', 'bundle')
) u
WHERE d.id = u.id
  AND u.opts IS NOT NULL
  AND u.opts <> COALESCE(d.options, '[]'::jsonb);

-- ── 6. Un-flag everything that cannot be a facet. ──────────────────────────
-- The rule is now enforced on the write path too
-- (`AttributeDefinitionService.validateFacetType`) and on the read path
-- (`getFilterableSpecs` drops them), but a row written before either existed —
-- notably by the XLSX import, which types every column it meets as TEXT — is
-- only fixable here. Left flagged, a single TEXT definition publishes a sidebar
-- control with one value per product in it.
UPDATE attribute_definitions
SET is_filterable = false
WHERE is_filterable = true
  AND type NOT IN ('SELECT'::"AttributeType", 'BOOLEAN'::"AttributeType");
