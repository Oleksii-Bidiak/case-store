import { parseCatalogRows, type SheetRow } from './xlsx-catalog.parser';

/**
 * The reference workbook's column order, trimmed to the fixed contract plus two
 * attribute columns. The blank cell after `Бренд` is deliberate: the real sheet
 * is ~100 columns of mostly-empty attribute headers, and a column with no header
 * must be skipped rather than turned into a nameless characteristic.
 */
const HEADER: SheetRow = [
  'Фото',
  'Артикул',
  'Штрих -код', // the source really does put a space before the hyphen
  'Відео',
  'Найменування',
  'Дизайн',
  'МРЦ',
  'Код виробника',
  'Опис',
  'Посилання',
  'Бренд',
  null,
  'Марка пристрою',
  'Модель',
  'Тип покриття',
  'Стиль',
];

/** Build a product row positionally, leaving unmentioned columns blank. */
function productRow(over: Partial<Record<number, unknown>> = {}): SheetRow {
  const row: unknown[] = [
    'https://img/a.jpg,https://img/b.jpg',
    614510003,
    '2003000208399',
    null,
    'Чохол Armor Magnetic Samsung Galaxy A35',
    'blue',
    299,
    'MCS00000815',
    '<p>Опис</p>',
    'https://ncase.ua/chehol-armor-magnetic-samsung-galaxy-a35',
    'PRC',
    null,
    'Samsung',
    'Samsung Galaxy A35',
    'Накладка',
    null,
  ];
  for (const [index, value] of Object.entries(over)) {
    row[Number(index)] = value;
  }
  return row;
}

/** A category separator: exactly one populated cell, anywhere in the row. */
function separatorRow(name: string): SheetRow {
  const row: unknown[] = new Array(HEADER.length).fill(null);
  row[3] = name;
  return row;
}

const parse = (body: SheetRow[]) => parseCatalogRows([HEADER, ...body], 'catalog.xlsx');

describe('parseCatalogRows — sheet shape', () => {
  it('reads a product row into the domain fields', () => {
    const result = parse([separatorRow('Чохли'), productRow()]);

    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]).toMatchObject({
      rowNumber: 3,
      categoryName: 'Чохли',
      // Numeric cells must survive as strings — the article number is a KEY,
      // and 614510003 vs "614510003" would not match across imports.
      sourceSku: '614510003',
      name: 'Чохол Armor Magnetic Samsung Galaxy A35',
      price: 299,
      brandName: 'PRC',
      design: 'blue',
      barcode: '2003000208399',
      deviceBrandName: 'Samsung',
      deviceModelNames: ['Samsung Galaxy A35'],
    });
    expect(result.issues).toHaveLength(0);
  });

  it('assigns every row to the separator above it', () => {
    const result = parse([
      separatorRow('Чохли'),
      productRow({ 1: 'A1' }),
      separatorRow('Захисне скло'),
      productRow({ 1: 'A2' }),
      productRow({ 1: 'A3' }),
    ]);

    expect(result.categoryNames).toEqual(['Чохли', 'Захисне скло']);
    expect(result.rows.map((r) => [r.sourceSku, r.categoryName])).toEqual([
      ['A1', 'Чохли'],
      ['A2', 'Захисне скло'],
      ['A3', 'Захисне скло'],
    ]);
  });

  it('recognises a separator wherever its single cell sits', () => {
    const moved: unknown[] = new Array(HEADER.length).fill(null);
    moved[0] = 'Аудіо';

    const result = parse([moved, productRow()]);

    expect(result.categoryNames).toEqual(['Аудіо']);
    expect(result.rows).toHaveLength(1);
  });

  it('skips fully blank rows without treating them as separators', () => {
    const blank: unknown[] = new Array(HEADER.length).fill(null);
    const result = parse([separatorRow('Чохли'), blank, productRow()]);

    expect(result.categoryNames).toEqual(['Чохли']);
    expect(result.rows).toHaveLength(1);
  });

  it('matches columns by header, so inserting one does not shift the values', () => {
    const shiftedHeader: SheetRow = ['Новий стовпець', ...HEADER];
    const shiftedRow: SheetRow = ['щось', ...productRow()];

    const result = parseCatalogRows(
      [shiftedHeader, separatorRow('Чохли'), shiftedRow],
      'catalog.xlsx',
    );

    expect(result.rows[0].sourceSku).toBe('614510003');
    expect(result.rows[0].name).toBe('Чохол Armor Magnetic Samsung Galaxy A35');
  });
});

describe('parseCatalogRows — validation', () => {
  it('drops a row whose price is zero and says why', () => {
    const result = parse([separatorRow('Чохли'), productRow({ 6: 0 })]);

    expect(result.rows).toHaveLength(0);
    expect(result.totalProductRows).toBe(1);
    expect(result.issues).toEqual([
      expect.objectContaining({ level: 'error', code: 'price-not-positive' }),
    ]);
  });

  it.each([
    ['missing-sku', { 1: null }],
    ['missing-name', { 4: null }],
  ])('drops a row with %s', (code, over) => {
    const result = parse([separatorRow('Чохли'), productRow(over)]);

    expect(result.rows).toHaveLength(0);
    expect(result.issues[0]).toMatchObject({ level: 'error', code });
  });

  it('drops a product row that appears before any category separator', () => {
    const result = parse([productRow()]);

    expect(result.rows).toHaveLength(0);
    expect(result.issues[0]).toMatchObject({ code: 'no-category' });
  });

  // An ambiguous key is worse than a missing row: on the next import it would
  // attach the file's data to whichever of the two products it matched first.
  it('drops BOTH rows when an article number repeats', () => {
    const result = parse([
      separatorRow('Чохли'),
      productRow({ 1: 'DUP', 4: 'Перший' }),
      productRow({ 1: 'DUP', 4: 'Другий' }),
    ]);

    expect(result.rows).toHaveLength(0);
    expect(result.issues[0]).toMatchObject({ code: 'duplicate-sku' });
  });

  it('throws when a required column is missing entirely', () => {
    const headerWithoutSku = HEADER.map((h) => (h === 'Артикул' ? null : h));

    expect(() => parseCatalogRows([headerWithoutSku, productRow()], 'catalog.xlsx')).toThrow(
      /Артикул/,
    );
  });

  it('throws on a file with no body rows', () => {
    expect(() => parseCatalogRows([HEADER], 'catalog.xlsx')).toThrow(/порожній/);
  });
});

describe('parseCatalogRows — attributes and devices', () => {
  it('turns unrecognised columns into keyed attributes and counts their fill', () => {
    const result = parse([
      separatorRow('Чохли'),
      productRow({ 1: 'A1', 15: 'Протиударні' }),
      productRow({ 1: 'A2', 14: null, 15: null }),
    ]);

    expect(result.rows[0].attributes).toEqual({
      'typ-pokryttia': 'Накладка',
      styl: 'Протиударні',
    });
    expect(result.rows[1].attributes).toEqual({});
    expect(result.attributeColumns).toEqual([
      { key: 'typ-pokryttia', label: 'Тип покриття', filledCount: 1 },
      { key: 'styl', label: 'Стиль', filledCount: 1 },
    ]);
  });

  it('omits attribute columns no surviving row populates', () => {
    const result = parse([separatorRow('Чохли'), productRow({ 14: null })]);

    expect(result.attributeColumns.map((c) => c.key)).toEqual([]);
  });

  it('splits a comma-separated model list', () => {
    const result = parse([
      separatorRow('Чохли'),
      productRow({ 13: 'iPhone 16 Pro, iPhone 17 , iPhone 16 Pro' }),
    ]);

    expect(result.rows[0].deviceModelNames).toEqual(['iPhone 16 Pro', 'iPhone 17']);
  });

  // "Універсальний" is not a manufacturer — turning it into a DeviceBrand would
  // give the storefront a device filter for a brand that does not exist.
  it('treats «Універсальний» as no device brand and no models', () => {
    const result = parse([
      separatorRow('Чохли'),
      productRow({ 12: 'Універсальний', 13: 'iPhone 16' }),
    ]);

    expect(result.rows[0].deviceBrandName).toBeNull();
    expect(result.rows[0].deviceModelNames).toEqual([]);
  });

  // The «Фото» column is recognised but never read (owner decision): the shop
  // does not keep the supplier's image URLs. It must stay RECOGNISED, though —
  // an unknown header becomes a characteristic column, and a wall of foreign
  // URLs would end up on the storefront under «Характеристики».
  it('recognises the photo column without turning it into a characteristic', () => {
    const result = parse([separatorRow('Чохли'), productRow()]);

    expect(result.attributeColumns.map((c) => c.label)).not.toContain('Фото');
    expect(Object.values(result.rows[0].attributes)).not.toContain(
      'https://img/a.jpg,https://img/b.jpg',
    );
  });
});
