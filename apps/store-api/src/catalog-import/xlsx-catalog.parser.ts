import { generateSlug } from '../common/utils';
import { MAX_DESCRIPTION_LENGTH } from '../product/product.constants';
import {
  AttributeColumn,
  AttributeMap,
  ParseIssue,
  ParsedCatalog,
  ParsedProductRow,
} from './catalog-import.types';

/**
 * Fixed columns, keyed by their NORMALIZED header text.
 *
 * Matched by header rather than by position so the supplier can insert or
 * reorder columns without silently shifting every value one cell to the left —
 * the failure mode that makes spreadsheet imports notorious. Anything not listed
 * here is treated as a product-characteristic column.
 */
type FixedField =
  | 'imageUrls'
  | 'sourceSku'
  | 'barcode'
  | 'videoUrl'
  | 'name'
  | 'design'
  | 'price'
  | 'manufacturerCode'
  | 'description'
  | 'sourceUrl'
  | 'brandName'
  | 'deviceBrandName'
  | 'deviceModelNames';

const FIXED_HEADERS: Record<string, FixedField> = {
  фото: 'imageUrls',
  артикул: 'sourceSku',
  'штрих-код': 'barcode',
  відео: 'videoUrl',
  найменування: 'name',
  дизайн: 'design',
  мрц: 'price',
  'код виробника': 'manufacturerCode',
  опис: 'description',
  посилання: 'sourceUrl',
  бренд: 'brandName',
  'марка пристрою': 'deviceBrandName',
  модель: 'deviceModelNames',
};

/**
 * `Марка пристрою` values that mean "fits anything", not a real device brand.
 * Turning these into a DeviceBrand row would produce a storefront filter for a
 * manufacturer that does not exist.
 */
const UNIVERSAL_DEVICE_BRANDS = new Set(['універсальний', 'універсальна', 'universal']);

/**
 * Normalize a header cell for matching: lowercase, tighten the spacing around
 * hyphens (the source sheet really does say `Штрих -код`), collapse whitespace.
 */
function normalizeHeader(value: unknown): string {
  return String(value ?? '')
    .toLowerCase()
    .replace(/\s*-\s*/g, '-')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Trim a cell to a string, mapping blanks to null. */
function text(value: unknown): string | null {
  if (value === null || value === undefined) {
    return null;
  }
  const trimmed = String(value).trim();
  return trimmed.length > 0 ? trimmed : null;
}

/** Is this cell empty for the purposes of "how many cells does this row use"? */
function isBlank(value: unknown): boolean {
  return text(value) === null;
}

/** Split a comma-separated cell into trimmed, de-duplicated, non-empty parts. */
function splitList(value: string | null, separator: RegExp): string[] {
  if (!value) {
    return [];
  }
  return [
    ...new Set(
      value
        .split(separator)
        .map((part) => part.trim())
        .filter(Boolean),
    ),
  ];
}

/**
 * Derive a stable, filter-safe key for an attribute column from its Ukrainian
 * header. Falls back to a positional key when the header transliterates to
 * nothing at all (e.g. a header of only punctuation), so two such columns can
 * never collide.
 */
function attributeKey(label: string, columnIndex: number): string {
  const slug = generateSlug(label);
  return slug.length > 0 ? slug : `column-${columnIndex + 1}`;
}

/** One sheet row as the reader hands it over: positional, blanks as null. */
export type SheetRow = readonly unknown[];

/** The single function we use out of `read-excel-file`. */
interface XlsxReader {
  readSheet(input: Buffer, sheet?: number): Promise<SheetRow[]>;
}

/**
 * Load the workbook reader.
 *
 * `read-excel-file` declares itself ESM (`"type": "module"`) but ships a CJS
 * entry under its `require` condition — which is the one Node actually resolves
 * for this CommonJS build. TypeScript, however, reads the package's ESM types
 * and rejects a static import; and a dynamic `import()` compiles through to a
 * real one, which Jest's CommonJS VM refuses without `--experimental-vm-modules`.
 * A plain `require` is the only form that satisfies all three, so the two-line
 * surface we use is declared by hand above rather than pulled from the package.
 *
 * Loaded lazily: this is a megabyte of XML parser that only the import screen
 * ever needs, and it should not sit in the API's boot path.
 */
function loadReader(): XlsxReader {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const reader = require('read-excel-file/node') as XlsxReader;
  return reader;
}

/**
 * Parse a supplier catalogue workbook (TASK-360).
 *
 * Thin wrapper: it reads the first sheet and hands the rows to
 * {@link parseCatalogRows}, which holds all of the logic. The split is what
 * makes the format testable — the rules below are exercised against plain
 * arrays rather than a committed binary workbook, which would be both opaque in
 * review and awkward to keep in a repository that (rightly) ignores `*.xlsx`.
 */
export async function parseXlsxCatalog(buffer: Buffer, filename: string): Promise<ParsedCatalog> {
  // Sheet 1 explicitly: the supplier workbook has exactly one sheet today, and
  // silently following a future second one would import the wrong data.
  const sheets = await loadReader()
    .readSheet(buffer, 1)
    .catch((error: unknown) => {
      throw new Error(
        `Не вдалося прочитати файл «${filename}»: ${error instanceof Error ? error.message : String(error)}`,
      );
    });

  // `readSheet` yields the rows directly; guard anyway so a future library
  // change surfaces as a clear message rather than a cascade of undefined.
  return parseCatalogRows(Array.isArray(sheets) ? (sheets as SheetRow[]) : [], filename);
}

/**
 * Turn raw sheet rows into a validated catalogue.
 *
 * The sheet's shape, verified against the reference file:
 *   - row 1 is the header — a UNION of every column any product uses, so most
 *     of its ~100 columns are blank on any given row;
 *   - a row with exactly ONE populated cell is a CATEGORY SEPARATOR, and every
 *     product row below it belongs to that category until the next separator;
 *   - every other populated row is one buyable position.
 *
 * Rows sharing a `Найменування` but differing in `Дизайн` are colour variants of
 * one item; that grouping is decided later, by the diff, since it needs the
 * whole file in hand.
 *
 * Pure — no I/O, no database, no Nest.
 */
export function parseCatalogRows(rows: SheetRow[], filename: string): ParsedCatalog {
  if (rows.length < 2) {
    throw new Error(`Файл «${filename}» порожній або не містить рядків з товарами.`);
  }

  const header = rows[0];
  const issues: ParseIssue[] = [];

  // ─── Resolve the header into column indexes ────────────────────────────────
  const fixedIndex: Partial<Record<FixedField, number>> = {};
  const attributeColumns: Array<{ index: number; key: string; label: string }> = [];
  const usedKeys = new Set<string>();

  header.forEach((cell, index) => {
    const normalized = normalizeHeader(cell);
    if (!normalized) {
      return;
    }
    const fixedField = FIXED_HEADERS[normalized];
    if (fixedField) {
      // First occurrence wins; a duplicated fixed header is a file defect worth
      // saying out loud rather than silently preferring one of the two.
      if (fixedIndex[fixedField] === undefined) {
        fixedIndex[fixedField] = index;
      } else {
        issues.push({
          level: 'warning',
          rowNumber: 1,
          sourceSku: null,
          code: 'duplicate-header',
          message: `Стовпець «${String(cell)}» зустрічається двічі — використано перший.`,
        });
      }
      return;
    }

    const label = String(cell).trim();
    let key = attributeKey(label, index);
    if (usedKeys.has(key)) {
      key = `${key}-${index + 1}`;
    }
    usedKeys.add(key);
    attributeColumns.push({ index, key, label });
  });

  for (const required of ['sourceSku', 'name', 'price'] as const) {
    if (fixedIndex[required] === undefined) {
      throw new Error(
        `У файлі «${filename}» немає обов'язкового стовпця: ` +
          `${required === 'sourceSku' ? 'Артикул' : required === 'name' ? 'Найменування' : 'МРЦ'}.`,
      );
    }
  }

  const at = (row: SheetRow, field: FixedField): unknown => {
    const index = fixedIndex[field];
    return index === undefined ? null : row[index];
  };

  // ─── Walk the body ────────────────────────────────────────────────────────
  const categoryNames: string[] = [];
  const parsed: ParsedProductRow[] = [];
  const seenSku = new Map<string, number>();
  let currentCategory: string | null = null;
  let totalProductRows = 0;

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    const rowNumber = i + 1;
    const populated = row.filter((cell) => !isBlank(cell));

    if (populated.length === 0) {
      continue;
    }

    // A separator carries a category name and nothing else. Testing for the
    // ABSENCE of an article number and a name (rather than trusting the cell's
    // column) keeps this working if the supplier moves the label.
    const sku = text(at(row, 'sourceSku'));
    const name = text(at(row, 'name'));
    if (populated.length === 1 && !sku && !name) {
      currentCategory = String(populated[0]).trim();
      if (!categoryNames.includes(currentCategory)) {
        categoryNames.push(currentCategory);
      }
      continue;
    }

    totalProductRows++;

    const error = (code: string, message: string): void => {
      issues.push({ level: 'error', rowNumber, sourceSku: sku, code, message });
    };

    if (!sku) {
      error('missing-sku', 'Рядок без артикула — його неможливо звірити з попереднім імпортом.');
      continue;
    }
    if (!name) {
      error('missing-name', `Артикул ${sku}: порожнє «Найменування».`);
      continue;
    }
    if (!currentCategory) {
      error(
        'no-category',
        `Артикул ${sku}: рядок стоїть вище за перший заголовок категорії, тому категорія невідома.`,
      );
      continue;
    }

    const firstSeenAt = seenSku.get(sku);
    if (firstSeenAt !== undefined) {
      error(
        'duplicate-sku',
        `Артикул ${sku} повторюється (уже був у рядку ${firstSeenAt}). Обидва рядки пропущено.`,
      );
      continue;
    }

    const priceRaw = at(row, 'price');
    const price = typeof priceRaw === 'number' ? priceRaw : Number(text(priceRaw));
    if (!Number.isFinite(price) || price <= 0) {
      error(
        'price-not-positive',
        `Артикул ${sku}: ціна «${String(priceRaw ?? '')}» не є додатним числом.`,
      );
      continue;
    }

    let description = text(at(row, 'description'));
    if (description && description.length > MAX_DESCRIPTION_LENGTH) {
      issues.push({
        level: 'warning',
        rowNumber,
        sourceSku: sku,
        code: 'description-truncated',
        message:
          `Артикул ${sku}: опис довший за ${MAX_DESCRIPTION_LENGTH} символів — ` +
          `його обрізано. Перевірте текст на сторінці товару.`,
      });
      description = description.slice(0, MAX_DESCRIPTION_LENGTH);
    }

    const attributes: AttributeMap = {};
    for (const column of attributeColumns) {
      const value = text(row[column.index]);
      if (value !== null) {
        attributes[column.key] = value;
      }
    }

    const deviceBrandRaw = text(at(row, 'deviceBrandName'));
    const deviceBrandName =
      deviceBrandRaw && !UNIVERSAL_DEVICE_BRANDS.has(deviceBrandRaw.toLowerCase())
        ? deviceBrandRaw
        : null;

    seenSku.set(sku, rowNumber);
    parsed.push({
      rowNumber,
      categoryName: currentCategory,
      sourceSku: sku,
      name,
      sourceUrl: text(at(row, 'sourceUrl')),
      description,
      price,
      brandName: text(at(row, 'brandName')),
      design: text(at(row, 'design')),
      barcode: text(at(row, 'barcode')),
      manufacturerCode: text(at(row, 'manufacturerCode')),
      videoUrl: text(at(row, 'videoUrl')),
      // Image URLs are comma-separated and never contain a comma themselves.
      imageUrls: splitList(text(at(row, 'imageUrls')), /\s*,\s*/),
      deviceBrandName,
      // Device models are comma-separated too, e.g. "iPhone 16 Pro, iPhone 17".
      deviceModelNames: deviceBrandName
        ? splitList(text(at(row, 'deviceModelNames')), /\s*,\s*/)
        : [],
      attributes,
    });
  }

  // A second pass at duplicates: the FIRST occurrence was already accepted by
  // the time its twin showed up, so drop it too. An ambiguous key is worse than
  // a missing row — it would attach the wrong product on the next import.
  const duplicated = new Set(
    issues.filter((issue) => issue.code === 'duplicate-sku').map((issue) => issue.sourceSku),
  );
  const rowsOut =
    duplicated.size === 0 ? parsed : parsed.filter((row) => !duplicated.has(row.sourceSku));

  // Counted from the SURVIVING rows, not the running tally: a row dropped as a
  // duplicate had already contributed to `attributeFill`, and a fill count that
  // includes rows the import will not write would misreport how thin a column is
  // — which is the one thing this number exists to tell the operator.
  const finalFill = new Map<string, number>();
  for (const row of rowsOut) {
    for (const key of Object.keys(row.attributes)) {
      finalFill.set(key, (finalFill.get(key) ?? 0) + 1);
    }
  }

  const usedAttributeColumns: AttributeColumn[] = attributeColumns
    .filter((column) => (finalFill.get(column.key) ?? 0) > 0)
    .map((column) => ({
      key: column.key,
      label: column.label,
      filledCount: finalFill.get(column.key) ?? 0,
    }));

  return {
    sheetName: filename,
    categoryNames,
    rows: rowsOut,
    attributeColumns: usedAttributeColumns,
    issues: issues.sort((a, b) => a.rowNumber - b.rowNumber),
    totalProductRows,
  };
}
