/**
 * Shared types for the supplier-catalogue import (TASK-360).
 *
 * Deliberately free of Nest and Prisma imports so the parser and the diff engine
 * — the two pieces that carry all the real logic — stay pure and unit-testable
 * against the real source file.
 */

/** One attribute column's value on one row, keyed by its generated spec key. */
export type AttributeMap = Record<string, string>;

/** A single product row as read from the sheet, before any domain mapping. */
export interface ParsedProductRow {
  /** 1-based sheet row number. The only thing an operator can act on. */
  rowNumber: number;
  /** Category name from the most recent separator row above this one. */
  categoryName: string;
  /** `Артикул` — unique per row, and the key that survives across file versions. */
  sourceSku: string;
  /** `Найменування`. */
  name: string;
  /** `Посилання` — the supplier's product URL; its last segment seeds the slug. */
  sourceUrl: string | null;
  /** `Опис` — supplier HTML, sanitized before it is persisted. */
  description: string | null;
  /** `МРЦ` — recommended retail price. */
  price: number;
  /** `Бренд`. */
  brandName: string | null;
  /** `Дизайн` — colour/finish. The variant axis for same-named rows. */
  design: string | null;
  /** `Штрих -код`. */
  barcode: string | null;
  /** `Код виробника`. */
  manufacturerCode: string | null;
  /** `Відео` — only sometimes an actual URL. */
  videoUrl: string | null;
  /**
   * `Фото` — the supplier's image URLs, recorded but never fetched (owner
   * decision, 2026-07-29). A later staging-only job re-hosts them; keeping the
   * list here means that job never has to re-parse the source file.
   */
  imageUrls: string[];
  /** `Марка пристрою` — device brand, or null for "Універсальний"/blank. */
  deviceBrandName: string | null;
  /** `Модель`, comma-separated in the source, split here. */
  deviceModelNames: string[];
  /** Every remaining populated column, keyed by generated spec key. */
  attributes: AttributeMap;
}

/** Severity of a parse finding. */
export type IssueLevel = 'error' | 'warning';

/**
 * Something the operator needs to see about a row before committing. `error`
 * drops the row from the import; `warning` lets it through.
 */
export interface ParseIssue {
  level: IssueLevel;
  /** 0 for file-level findings that belong to no single row. */
  rowNumber: number;
  /** `Артикул` when known — lets the operator find the row in Excel. */
  sourceSku: string | null;
  /** Stable machine code, e.g. `price-not-positive`. */
  code: string;
  /** Ukrainian one-liner rendered in the admin preview. */
  message: string;
}

/** An attribute column discovered in the sheet header. */
export interface AttributeColumn {
  /** Generated, filter-safe token used as `AttributeDefinition.key`. */
  key: string;
  /** The header text verbatim — becomes `AttributeDefinition.label`. */
  label: string;
  /** How many product rows populate it. Surfaced so a 1-row column is visible. */
  filledCount: number;
}

/** The whole sheet, parsed and validated. */
export interface ParsedCatalog {
  sheetName: string;
  /** Category names in the order the separator rows introduced them. */
  categoryNames: string[];
  /** Rows that passed validation — the ones the import will act on. */
  rows: ParsedProductRow[];
  /** Attribute columns that at least one surviving row populates. */
  attributeColumns: AttributeColumn[];
  /** Errors and warnings, in row order. */
  issues: ParseIssue[];
  /** Product rows seen before validation — `rows.length + errors` ≥ this. */
  totalProductRows: number;
}
