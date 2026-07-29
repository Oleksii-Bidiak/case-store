import {
  buildImportPlan,
  fingerprintOf,
  type CurrentProductSnapshot,
  type LedgerEntry,
} from './catalog-plan';
import type { ParsedCatalog, ParsedProductRow } from './catalog-import.types';

function row(over: Partial<ParsedProductRow> = {}): ParsedProductRow {
  return {
    rowNumber: 3,
    categoryName: 'Чохли',
    sourceSku: 'A1',
    name: 'Чохол Armor',
    sourceUrl: 'https://ncase.ua/chehol-armor',
    description: '<p>Опис</p>',
    price: 299,
    brandName: 'PRC',
    design: 'blue',
    barcode: null,
    manufacturerCode: null,
    videoUrl: null,
    deviceBrandName: 'Samsung',
    deviceModelNames: ['Samsung Galaxy A35'],
    attributes: { styl: 'Протиударні' },
    ...over,
  };
}

function catalog(rows: ParsedProductRow[]): ParsedCatalog {
  return {
    sheetName: 'catalog.xlsx',
    categoryNames: [...new Set(rows.map((r) => r.categoryName))],
    rows,
    attributeColumns: [],
    issues: [],
    totalProductRows: rows.length,
  };
}

/** A live product that matches `row()` exactly, as the last import left it. */
function product(over: Partial<CurrentProductSnapshot> = {}): CurrentProductSnapshot {
  return {
    id: 'p1',
    name: 'Чохол Armor',
    slug: 'chehol-armor',
    description: '<p>Опис</p>',
    price: '299.00',
    sku: 'A1',
    brandName: 'PRC',
    categoryName: 'Чохли',
    design: 'blue',
    isActive: true,
    ...over,
  };
}

function ledgerFor(parsed: ParsedProductRow, productId: string | null = 'p1'): LedgerEntry {
  return {
    sourceSku: parsed.sourceSku,
    productId,
    lastImported: fingerprintOf(parsed, 'chehol-armor'),
  };
}

const ledgerMap = (...entries: LedgerEntry[]) =>
  new Map(entries.map((entry) => [entry.sourceSku, entry]));
const currentMap = (...products: CurrentProductSnapshot[]) =>
  new Map(products.map((p) => [p.id, p]));

describe('fingerprintOf — the ledger keeps no supplier data', () => {
  // The whole point of the ledger being hashes: the shop must not end up
  // holding a second permanent copy of the supplier's catalogue.
  it('stores no recognisable value from the row', () => {
    const parsed = row({
      name: 'Чохол Armor',
      description: '<p>Дуже характерний опис</p>',
      brandName: 'PRC',
    });

    const serialized = JSON.stringify(fingerprintOf(parsed, 'chehol-armor'));

    for (const secret of ['Чохол Armor', 'характерний', 'PRC', '299', 'chehol-armor']) {
      expect(serialized).not.toContain(secret);
    }
  });

  it('records one short digest per diffable field', () => {
    const fingerprints = fingerprintOf(row(), 'chehol-armor');

    expect(Object.keys(fingerprints).sort()).toEqual([
      'attributes',
      'brandName',
      'categoryName',
      'description',
      'design',
      'deviceModels',
      'name',
      'price',
      'sku',
      'slug',
    ]);
    for (const digest of Object.values(fingerprints)) {
      expect(digest).toMatch(/^[0-9a-f]{16}$/);
    }
  });

  it('is stable for equal values and different for changed ones', () => {
    const base = fingerprintOf(row(), 'chehol-armor');

    expect(fingerprintOf(row(), 'chehol-armor').price).toBe(base.price);
    // Whitespace and null/blank are not changes; a real edit is.
    expect(fingerprintOf(row({ name: '  Чохол Armor  ' }), 'chehol-armor').name).toBe(base.name);
    expect(fingerprintOf(row({ description: null }), 'chehol-armor').description).toBe(
      fingerprintOf(row({ description: '   ' }), 'chehol-armor').description,
    );
    expect(fingerprintOf(row({ price: 349 }), 'chehol-armor').price).not.toBe(base.price);
  });

  it('ignores ordering inside the set-valued fields', () => {
    const a = fingerprintOf(row({ deviceModelNames: ['iPhone 16', 'iPhone 17'] }), 's');
    const b = fingerprintOf(row({ deviceModelNames: ['iPhone 17', 'iPhone 16'] }), 's');

    expect(a.deviceModels).toBe(b.deviceModels);
  });
});

describe('buildImportPlan — first import', () => {
  it('plans every unknown article as a create', () => {
    const plan = buildImportPlan(
      catalog([row({ sourceSku: 'A1' }), row({ sourceSku: 'A2', name: 'Інший' })]),
      new Map(),
      new Map(),
    );

    expect(plan.counts).toMatchObject({ create: 2, update: 0, missing: 0 });
    expect(plan.rows.every((r) => r.action === 'create')).toBe(true);
    expect(plan.rows.every((r) => r.productId === null)).toBe(true);
  });

  it('re-creates an article whose product was deleted out from under the ledger', () => {
    const parsed = row();
    const plan = buildImportPlan(
      catalog([parsed]),
      ledgerMap(ledgerFor(parsed, 'p-gone')),
      new Map(), // the product is no longer there
    );

    expect(plan.rows[0].action).toBe('create');
  });
});

describe('buildImportPlan — idempotence', () => {
  // The single most important property: re-uploading the same file must be a
  // no-op. If it is not, every routine re-import churns the catalogue.
  it('proposes nothing when the file, ledger and database all agree', () => {
    const parsed = row();
    const plan = buildImportPlan(
      catalog([parsed]),
      ledgerMap(ledgerFor(parsed)),
      currentMap(product()),
    );

    expect(plan.counts).toMatchObject({ create: 0, update: 0, unchanged: 1, missing: 0 });
    expect(plan.rows[0].changes).toEqual([]);
  });

  it('leaves a hand-edited field alone while the supplier still says the old value', () => {
    const parsed = row();
    const plan = buildImportPlan(
      catalog([parsed]),
      ledgerMap(ledgerFor(parsed)),
      currentMap(product({ name: 'Назва, яку виправив оператор' })),
    );

    expect(plan.rows[0].action).toBe('unchanged');
    expect(plan.rows[0].changes).toEqual([]);
  });
});

describe('buildImportPlan — updates and conflicts', () => {
  it('proposes a change when the source moved and nobody touched the shop', () => {
    const previous = row();
    const plan = buildImportPlan(
      catalog([row({ price: 349 })]),
      ledgerMap(ledgerFor(previous)),
      currentMap(product()),
    );

    expect(plan.rows[0].action).toBe('update');
    expect(plan.rows[0].changes).toEqual([
      expect.objectContaining({ field: 'price', from: '299.00', to: '349.00', conflict: false }),
    ]);
    expect(plan.counts.conflicts).toBe(0);
  });

  it('flags a conflict when the source moved AND a human had edited the same field', () => {
    const previous = row();
    const plan = buildImportPlan(
      catalog([row({ price: 349 })]),
      ledgerMap(ledgerFor(previous)),
      currentMap(product({ price: '279.00' })),
    );

    const change = plan.rows[0].changes[0];
    expect(change).toMatchObject({ field: 'price', from: '279.00', to: '349.00', conflict: true });
    expect(plan.counts.conflicts).toBe(1);
  });

  it('skips a field the shop already agrees with, whoever got there first', () => {
    const previous = row();
    const plan = buildImportPlan(
      catalog([row({ price: 349 })]),
      ledgerMap(ledgerFor(previous)),
      currentMap(product({ price: '349.00' })),
    );

    expect(plan.rows[0].action).toBe('unchanged');
  });

  it('reports several changed fields on one row', () => {
    const previous = row();
    const plan = buildImportPlan(
      catalog([row({ price: 349, name: 'Чохол Armor Pro', brandName: 'WIWU' })]),
      ledgerMap(ledgerFor(previous)),
      currentMap(product()),
    );

    expect(plan.rows[0].changes.map((c) => c.field).sort()).toEqual(['brandName', 'name', 'price']);
  });

  it('shortens a long description into a readable preview', () => {
    const previous = row();
    const plan = buildImportPlan(
      catalog([row({ description: `<p>${'дуже довгий опис '.repeat(40)}</p>` })]),
      ledgerMap(ledgerFor(previous)),
      currentMap(product()),
    );

    const change = plan.rows[0].changes.find((c) => c.field === 'description')!;
    expect(change.to.length).toBeLessThanOrEqual(121);
    expect(change.to).toContain('…');
    expect(change.to).not.toContain('<p>');
  });

  it('treats specs and compatibility as one change each, not one per key', () => {
    const previous = row();
    const plan = buildImportPlan(
      catalog([
        row({
          attributes: { styl: 'Класика', material: 'Шкіра', color: 'синій' },
          deviceModelNames: ['Samsung Galaxy A35', 'Samsung Galaxy A36'],
        }),
      ]),
      ledgerMap(ledgerFor(previous)),
      currentMap(product()),
    );

    const fields = plan.rows[0].changes.map((c) => c.field);
    expect(fields).toEqual(['attributes', 'deviceModels']);
    // Set-valued changes carry no 'from': the ledger keeps hashes, not values.
    expect(plan.rows[0].changes[0]).toMatchObject({ to: '3 знач.' });
    expect(plan.rows[0].changes[0].from).toBeUndefined();
  });

  it('ignores device-model ordering', () => {
    const previous = row({ deviceModelNames: ['iPhone 16', 'iPhone 17'] });
    const plan = buildImportPlan(
      catalog([row({ deviceModelNames: ['iPhone 17', 'iPhone 16'] })]),
      ledgerMap(ledgerFor(previous)),
      currentMap(product()),
    );

    expect(plan.rows[0].action).toBe('unchanged');
  });
});

describe('buildImportPlan — articles that vanish from the file', () => {
  it('plans a hide, not a delete', () => {
    const previous = row({ sourceSku: 'GONE' });
    const plan = buildImportPlan(
      catalog([row({ sourceSku: 'STILL-HERE' })]),
      ledgerMap(ledgerFor(previous, 'p-gone')),
      currentMap(product({ id: 'p-gone', name: 'Знятий з продажу' })),
    );

    const missing = plan.rows.find((r) => r.action === 'missing');
    expect(missing).toMatchObject({ sourceSku: 'GONE', productId: 'p-gone' });
    expect(plan.counts.missing).toBe(1);
  });

  it('says nothing about an article that is already hidden', () => {
    const previous = row({ sourceSku: 'GONE' });
    const plan = buildImportPlan(
      catalog([row({ sourceSku: 'STILL-HERE' })]),
      ledgerMap(ledgerFor(previous, 'p-gone')),
      currentMap(product({ id: 'p-gone', isActive: false })),
    );

    expect(plan.counts.missing).toBe(0);
  });

  it('brings a restored article back as a normal row, not a create', () => {
    const previous = row();
    const plan = buildImportPlan(
      catalog([row()]),
      ledgerMap(ledgerFor(previous)),
      currentMap(product({ isActive: false })),
    );

    expect(plan.rows[0].action).toBe('unchanged');
    expect(plan.counts.missing).toBe(0);
  });
});

describe('buildImportPlan — slugs and groups', () => {
  // The supplier gives colour variants one shared URL, so its slugs collide by
  // construction: 274 such groups in the reference file.
  it('keeps the base slug for the first variant and suffixes the rest', () => {
    const plan = buildImportPlan(
      catalog([
        row({ sourceSku: 'A1', design: 'blue' }),
        row({ sourceSku: 'A2', design: 'black' }),
        row({ sourceSku: 'A3', design: 'red' }),
      ]),
      new Map(),
      new Map(),
    );

    expect(plan.rows.map((r) => r.slug)).toEqual([
      'chehol-armor',
      'chehol-armor-black',
      'chehol-armor-red',
    ]);
  });

  it('falls back to the article number once the design suffix is taken too', () => {
    const plan = buildImportPlan(
      catalog([
        row({ sourceSku: 'A1', design: 'blue' }),
        row({ sourceSku: 'A2', design: 'blue' }),
        row({ sourceSku: 'A3', design: 'blue' }),
      ]),
      new Map(),
      new Map(),
    );

    // Base → design → article number. Every step is deterministic, so re-running
    // the same file assigns the same slug to the same row.
    expect(plan.rows.map((r) => r.slug)).toEqual([
      'chehol-armor',
      'chehol-armor-blue',
      'chehol-armor-a3',
    ]);
    expect(new Set(plan.rows.map((r) => r.slug)).size).toBe(3);
  });

  it('still produces a unique slug when a row has no design at all', () => {
    const plan = buildImportPlan(
      catalog([row({ sourceSku: 'A1', design: null }), row({ sourceSku: 'A2', design: null })]),
      new Map(),
      new Map(),
    );

    expect(plan.rows.map((r) => r.slug)).toEqual(['chehol-armor', 'chehol-armor-a2']);
  });

  // The supplier's raw URL tails are not valid slugs: `…-1-5a--2m-` has a
  // doubled and a trailing hyphen, both rejected by the product DTO.
  it('cleans a supplier slug that would fail the product slug pattern', () => {
    const plan = buildImportPlan(
      catalog([row({ sourceUrl: 'https://ncase.ua/kabel-baseus-cafule-lightning-1-5a--2m-' })]),
      new Map(),
      new Map(),
    );

    expect(plan.rows[0].slug).toBe('kabel-baseus-cafule-lightning-1-5a-2m');
    expect(plan.rows[0].slug).toMatch(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
  });

  it('derives a slug from the name when the supplier gives no URL', () => {
    const plan = buildImportPlan(
      catalog([row({ sourceUrl: null, name: 'Чохол Armor Magnetic' })]),
      new Map(),
      new Map(),
    );

    expect(plan.rows[0].slug).toBe('chokhol-armor-magnetic');
  });

  it('groups same-named rows and leaves a lone row ungrouped', () => {
    const plan = buildImportPlan(
      catalog([
        row({ sourceSku: 'A1', design: 'blue' }),
        row({ sourceSku: 'A2', design: 'black' }),
        row({ sourceSku: 'B1', name: 'Скло', sourceUrl: 'https://ncase.ua/sklo' }),
      ]),
      new Map(),
      new Map(),
    );

    expect(plan.groups).toEqual([{ name: 'Чохол Armor', sourceSkus: ['A1', 'A2'] }]);
  });
});

describe('buildImportPlan — referenced entities', () => {
  it('tallies categories, brands and devices with their usage counts', () => {
    const plan = buildImportPlan(
      catalog([
        row({ sourceSku: 'A1' }),
        row({ sourceSku: 'A2', brandName: 'WIWU', deviceModelNames: ['iPhone 16'] }),
        row({ sourceSku: 'A3', categoryName: 'Аудіо', brandName: null, deviceBrandName: null }),
      ]),
      new Map(),
      new Map(),
    );

    expect(plan.categories).toEqual([
      { name: 'Чохли', slug: 'chokhly', usageCount: 2 },
      { name: 'Аудіо', slug: 'audio', usageCount: 1 },
    ]);
    expect(plan.brands.map((b) => [b.name, b.usageCount])).toEqual([
      ['PRC', 1],
      ['WIWU', 1],
    ]);
    expect(plan.deviceModels.map((m) => m.name)).toEqual(['Samsung Galaxy A35', 'iPhone 16']);
  });
});
