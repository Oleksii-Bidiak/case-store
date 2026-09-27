#!/usr/bin/env node
/**
 * check-spec-separators — list the facet values that the catalogue filter
 * cannot represent (TASK-514). READ-ONLY: one `BEGIN READ ONLY` transaction,
 * two SELECTs, `ROLLBACK`.
 *
 * WHY
 * ---
 * The catalogue's `?specs=` parameter is `key:v1,v2;key2:v3` — `;` between
 * facets, `,` between the values of one facet — and has no escape. An option
 * «Силікон, м'який» is split by both parsers (API `parseSpecFilters`, storefront
 * `parseSpecParam`) into «Силікон» and «м'який», neither of which any product
 * carries, so ticking it silently finds nothing.
 *
 * Since TASK-514 the admin API refuses such an option on create/update of a
 * characteristic. This script finds the ones written BEFORE that rule: the
 * options of every definition, and the stored values of SELECT/BOOLEAN specs
 * (the only types that can be facets). Free-text (TEXT) values are not listed —
 * they never reach the filter and may contain commas freely.
 *
 * USAGE
 * -----
 *   DATABASE_URL=postgresql://user:pass@host:5432/db node scripts/check-spec-separators.js
 *
 * Exit code 0 = nothing to fix; 1 = findings printed (rename them in the admin
 * panel: «Каталог → Категорії → Характеристики», replace «,»/«;» with «—» or
 * brackets, then re-pick the value on the affected products); 2 = could not run.
 */
'use strict';

const { Client } = require('pg');

const OPTIONS_SQL = `
  SELECT c.name AS category, d.key, d.label, d.type::text AS type, opt AS value
  FROM attribute_definitions d
  JOIN categories c ON c.id = d.category_id
  CROSS JOIN LATERAL jsonb_array_elements_text(
    CASE WHEN jsonb_typeof(d.options::jsonb) = 'array' THEN d.options::jsonb ELSE '[]'::jsonb END
  ) AS opt
  WHERE opt ~ '[,;]'
  ORDER BY c.name, d.key, opt`;

const VALUES_SQL = `
  SELECT c.name AS category, d.key, d.label, d.type::text AS type, v.value,
         count(*)::int AS products, min(p.slug) AS example_product
  FROM product_attribute_values v
  JOIN attribute_definitions d ON d.id = v.definition_id
  JOIN categories c ON c.id = d.category_id
  JOIN products p ON p.id = v.product_id
  WHERE d.type::text IN ('SELECT', 'BOOLEAN') AND v.value ~ '[,;]'
  GROUP BY c.name, d.key, d.label, d.type, v.value
  ORDER BY c.name, d.key, v.value`;

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    console.error('DATABASE_URL is not set. See the usage note at the top of this file.');
    return 2;
  }

  const client = new Client({ connectionString });
  await client.connect();
  try {
    await client.query('BEGIN READ ONLY');
    const options = (await client.query(OPTIONS_SQL)).rows;
    const values = (await client.query(VALUES_SQL)).rows;
    await client.query('ROLLBACK');

    if (options.length === 0 && values.length === 0) {
      console.log('OK: no characteristic option or facet value contains «,» or «;».');
      return 0;
    }

    if (options.length > 0) {
      console.log(`Options containing «,» or «;» (${options.length}):`);
      for (const row of options) {
        console.log(`  [${row.category}] ${row.label} (${row.key}, ${row.type}): «${row.value}»`);
      }
    }
    if (values.length > 0) {
      console.log(`Stored facet values containing «,» or «;» (${values.length}):`);
      for (const row of values) {
        console.log(
          `  [${row.category}] ${row.label} (${row.key}, ${row.type}): «${row.value}» — ` +
            `${row.products} product(s), e.g. ${row.example_product}`,
        );
      }
    }
    return 1;
  } finally {
    await client.end();
  }
}

main().then(
  (code) => process.exit(code),
  (error) => {
    console.error(`check-spec-separators: ${error.message}`);
    process.exit(2);
  },
);
