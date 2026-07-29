import { generateSlug } from '../common/utils';
import { ParsedCatalog, ParsedProductRow } from './catalog-import.types';

/**
 * What the importer wrote for one article last time. Stored verbatim in
 * `CatalogImportItem.lastImported` and used as the diff base.
 *
 * It is the third leg of the comparison and the reason a repeat import is safe:
 * the file tells us what the supplier says NOW, the database tells us what the
 * shop shows now, and this tells us what the importer itself put there. Without
 * it, "the supplier raised the price" and "an operator corrected the price" look
 * identical.
 */
export interface ImportedSnapshot {
  name: string;
  slug: string;
  description: string | null;
  /** Decimal string, so it compares equal to `Product.price.toString()`. */
  price: string;
  sku: string;
  brandName: string | null;
  categoryName: string;
  design: string | null;
  deviceModelNames: string[];
  attributes: Record<string, string>;
}

/** The live product as the database currently holds it. */
export interface CurrentProductSnapshot {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  price: string;
  sku: string | null;
  brandName: string | null;
  categoryName: string;
  design: string | null;
  isActive: boolean;
}

/** One ledger row, as far as the planner cares. */
export interface LedgerEntry {
  sourceSku: string;
  productId: string | null;
  lastImported: ImportedSnapshot;
}

export type RowAction = 'create' | 'update' | 'unchanged' | 'missing';

/**
 * Scalar fields the planner offers as individually tickable changes. Set-valued
 * data (specs, device compatibility) is handled as one composite change each —
 * ticking 87 spec keys per row would be a worse tool, not a better one.
 */
export const DIFFABLE_FIELDS = [
  'name',
  'slug',
  'description',
  'price',
  'sku',
  'brandName',
  'categoryName',
  'design',
] as const;

export type DiffableField = (typeof DIFFABLE_FIELDS)[number];

/** Composite (set-valued) changes, proposed whole or not at all. */
export type CompositeField = 'attributes' | 'deviceModels';

export type ChangeField = DiffableField | CompositeField;

/** Ukrainian labels for the preview table. */
export const FIELD_LABELS: Record<ChangeField, string> = {
  name: 'Назва',
  slug: 'Адреса (slug)',
  description: 'Опис',
  price: 'Ціна',
  sku: 'Артикул',
  brandName: 'Бренд',
  categoryName: 'Категорія',
  design: 'Колір / дизайн',
  attributes: 'Характеристики',
  deviceModels: 'Сумісність',
};

/** How much of a value the preview carries. Descriptions are the reason. */
const PREVIEW_LIMIT = 120;

/** One proposed field change, with everything the operator needs to judge it. */
export interface FieldChange {
  field: ChangeField;
  label: string;
  /** Current database value, shortened for display. */
  from: string;
  /** Incoming file value, shortened for display. */
  to: string;
  /**
   * True when the database no longer matches what the import last wrote — i.e.
   * a human edited this field by hand. The change is still PROPOSED (the owner
   * chose "file wins"), but it is flagged, and the UI offers to untick every
   * conflicting change at once.
   */
  conflict: boolean;
}

/** One row of the plan. */
export interface PlannedRow {
  sourceSku: string;
  /** Sheet row number, so the operator can find it in Excel. */
  rowNumber: number;
  action: RowAction;
  /** Product name for display — the file's for creates, the shop's otherwise. */
  name: string;
  productId: string | null;
  /** Slug the import will use. Computed here because variants collide. */
  slug: string;
  changes: FieldChange[];
}

/** A referenced entity the import will create if it does not exist yet. */
export interface PlannedEntity {
  name: string;
  slug: string;
  /** How many rows reference it — lets the operator spot a typo'd one-off. */
  usageCount: number;
}

/** A variant group the import will form from same-named rows. */
export interface PlannedGroup {
  name: string;
  /** Article numbers of the positions, in file order. */
  sourceSkus: string[];
}

/** The full, reviewable import plan. */
export interface CatalogImportPlan {
  rows: PlannedRow[];
  categories: PlannedEntity[];
  brands: PlannedEntity[];
  deviceBrands: PlannedEntity[];
  deviceModels: PlannedEntity[];
  attributeColumns: ParsedCatalog['attributeColumns'];
  groups: PlannedGroup[];
  issues: ParsedCatalog['issues'];
  counts: {
    total: number;
    create: number;
    update: number;
    unchanged: number;
    missing: number;
    conflicts: number;
    errors: number;
  };
}

/** Shorten a value for the preview table, collapsing markup and whitespace. */
function preview(value: unknown): string {
  if (value === null || value === undefined) {
    return '—';
  }
  const flat = String(value)
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (flat.length === 0) {
    return '—';
  }
  return flat.length > PREVIEW_LIMIT ? `${flat.slice(0, PREVIEW_LIMIT)}…` : flat;
}

/** Compare two values the way the ledger stores them (null ≡ absent ≡ ""). */
function sameScalar(a: unknown, b: unknown): boolean {
  const norm = (v: unknown) => (v === null || v === undefined ? '' : String(v).trim());
  return norm(a) === norm(b);
}

/** Order-insensitive set comparison for the composite fields. */
function sameSet(a: readonly string[], b: readonly string[]): boolean {
  if (a.length !== b.length) {
    return false;
  }
  const left = [...a].sort();
  const right = [...b].sort();
  return left.every((value, index) => value === right[index]);
}

function sameMap(a: Record<string, string>, b: Record<string, string>): boolean {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  for (const key of keys) {
    if (!sameScalar(a[key], b[key])) {
      return false;
    }
  }
  return true;
}

/**
 * Derive the slug for a row.
 *
 * The supplier's `Посилання` already ends in a usable slug, so we prefer it —
 * it is the URL the product is known by elsewhere. But it is NOT safe as-is:
 * the raw tails contain doubled and trailing hyphens (`…-1-5a--2m-`) that fail
 * the product DTO's slug pattern, so everything goes through `generateSlug`.
 */
function baseSlugFor(row: ParsedProductRow): string {
  const tail = row.sourceUrl?.split('/').filter(Boolean).pop();
  const fromUrl = tail ? generateSlug(tail) : '';
  return fromUrl || generateSlug(row.name) || generateSlug(row.sourceSku);
}

/**
 * Assign a unique slug to every row.
 *
 * Colour variants of one item share a name AND a supplier URL — 274 of them in
 * the reference file, covering 1087 rows — so the file's own slugs collide by
 * construction. The first position of a group keeps the base slug (it is the one
 * already indexed under that URL); its siblings get their design appended.
 */
function assignSlugs(rows: ParsedProductRow[]): Map<string, string> {
  const slugs = new Map<string, string>();
  const taken = new Set<string>();

  for (const row of rows) {
    const base = baseSlugFor(row);
    let candidate = taken.has(base) && row.design ? `${base}-${generateSlug(row.design)}` : base;

    // Two positions with the same design, or a design that transliterates to
    // nothing: fall back to the article number, which is unique by definition.
    if (taken.has(candidate)) {
      candidate = `${base}-${generateSlug(row.sourceSku)}`;
    }
    let suffix = 2;
    while (taken.has(candidate)) {
      candidate = `${base}-${suffix++}`;
    }

    taken.add(candidate);
    slugs.set(row.sourceSku, candidate);
  }

  return slugs;
}

/** Build the snapshot the ledger will store for a row once it is written. */
export function snapshotOf(row: ParsedProductRow, slug: string): ImportedSnapshot {
  return {
    name: row.name,
    slug,
    description: row.description,
    price: row.price.toFixed(2),
    sku: row.sourceSku,
    brandName: row.brandName,
    categoryName: row.categoryName,
    design: row.design,
    deviceModelNames: row.deviceModelNames,
    attributes: row.attributes,
  };
}

/** Read a diffable field off the file row's snapshot. */
function fileValue(snapshot: ImportedSnapshot, field: DiffableField): string | null {
  return snapshot[field];
}

/** Read the same field off the live product. */
function dbValue(current: CurrentProductSnapshot, field: DiffableField): string | null {
  return current[field];
}

/**
 * Build the reviewable plan for an import run (TASK-360).
 *
 * Three-way comparison per row, keyed on the supplier's article number:
 *
 *   | ledger | file vs ledger | db vs ledger | outcome                        |
 *   |--------|----------------|--------------|--------------------------------|
 *   | absent | —              | —            | CREATE (as a hidden draft)     |
 *   | known  | same           | —            | UNCHANGED — nothing proposed   |
 *   | known  | differs        | same         | UPDATE, ticked                 |
 *   | known  | differs        | differs      | UPDATE, ticked + CONFLICT flag |
 *   | known  | row gone       | —            | MISSING → hide, never delete   |
 *
 * `stock` and `isActive` are never proposed: the file carries no stock column,
 * and publication is the operator's decision, not the supplier's. The one
 * exception is MISSING, which hides the product — reversibly, so restoring the
 * row to the file brings it straight back.
 *
 * Pure — the caller supplies the ledger and the current product state.
 */
export function buildImportPlan(
  catalog: ParsedCatalog,
  ledger: Map<string, LedgerEntry>,
  current: Map<string, CurrentProductSnapshot>,
): CatalogImportPlan {
  const slugs = assignSlugs(catalog.rows);
  const rows: PlannedRow[] = [];
  let conflicts = 0;

  for (const row of catalog.rows) {
    const slug = slugs.get(row.sourceSku)!;
    const incoming = snapshotOf(row, slug);
    const entry = ledger.get(row.sourceSku);
    const product = entry?.productId ? current.get(entry.productId) : undefined;

    // Never imported, or imported into a product that has since been deleted:
    // either way there is nothing to update, so make a fresh draft.
    if (!entry || !product) {
      rows.push({
        sourceSku: row.sourceSku,
        rowNumber: row.rowNumber,
        action: 'create',
        name: row.name,
        productId: null,
        slug,
        changes: [],
      });
      continue;
    }

    const previous = entry.lastImported;
    const changes: FieldChange[] = [];

    for (const field of DIFFABLE_FIELDS) {
      const next = fileValue(incoming, field);
      // The SOURCE has to have moved. If the supplier still says what it said
      // last time, an operator's edit is simply their edit — not a conflict to
      // resolve, and certainly not a change to propose reverting.
      if (sameScalar(next, previous[field])) {
        continue;
      }
      const live = dbValue(product, field);
      if (sameScalar(next, live)) {
        continue; // Already matches — someone got there first.
      }
      const conflict = !sameScalar(live, previous[field]);
      if (conflict) {
        conflicts++;
      }
      changes.push({
        field,
        label: FIELD_LABELS[field],
        from: preview(live),
        to: preview(next),
        conflict,
      });
    }

    // Composite fields compare against the ledger only. They are sets the
    // supplier owns wholesale; diffing them per key would produce a checklist
    // nobody could read, and a half-applied spec set is not a coherent state.
    if (!sameMap(incoming.attributes, previous.attributes)) {
      changes.push({
        field: 'attributes',
        label: FIELD_LABELS.attributes,
        from: `${Object.keys(previous.attributes).length} знач.`,
        to: `${Object.keys(incoming.attributes).length} знач.`,
        conflict: false,
      });
    }
    if (!sameSet(incoming.deviceModelNames, previous.deviceModelNames)) {
      changes.push({
        field: 'deviceModels',
        label: FIELD_LABELS.deviceModels,
        from: preview(previous.deviceModelNames.join(', ')),
        to: preview(incoming.deviceModelNames.join(', ')),
        conflict: false,
      });
    }

    rows.push({
      sourceSku: row.sourceSku,
      rowNumber: row.rowNumber,
      action: changes.length > 0 ? 'update' : 'unchanged',
      name: product.name,
      productId: product.id,
      slug,
      changes,
    });
  }

  // Articles the ledger knows but this file no longer lists. Already-hidden ones
  // are left alone so a repeat import of the same file stays a no-op.
  const inFile = new Set(catalog.rows.map((row) => row.sourceSku));
  for (const entry of ledger.values()) {
    if (inFile.has(entry.sourceSku) || !entry.productId) {
      continue;
    }
    const product = current.get(entry.productId);
    if (!product || !product.isActive) {
      continue;
    }
    rows.push({
      sourceSku: entry.sourceSku,
      rowNumber: 0,
      action: 'missing',
      name: product.name,
      productId: product.id,
      slug: product.slug,
      changes: [],
    });
  }

  const errors = catalog.issues.filter((issue) => issue.level === 'error').length;
  const counts = {
    total: rows.length,
    create: rows.filter((row) => row.action === 'create').length,
    update: rows.filter((row) => row.action === 'update').length,
    unchanged: rows.filter((row) => row.action === 'unchanged').length,
    missing: rows.filter((row) => row.action === 'missing').length,
    conflicts,
    errors,
  };

  return {
    rows,
    categories: countedEntities(catalog.rows.map((row) => row.categoryName)),
    brands: countedEntities(catalog.rows.map((row) => row.brandName)),
    deviceBrands: countedEntities(catalog.rows.map((row) => row.deviceBrandName)),
    deviceModels: countedEntities(catalog.rows.flatMap((row) => row.deviceModelNames)),
    attributeColumns: catalog.attributeColumns,
    groups: buildGroups(catalog.rows),
    issues: catalog.issues,
    counts,
  };
}

/** Tally distinct non-empty names, preserving first-seen order. */
function countedEntities(names: Array<string | null>): PlannedEntity[] {
  const counts = new Map<string, number>();
  for (const name of names) {
    if (name) {
      counts.set(name, (counts.get(name) ?? 0) + 1);
    }
  }
  return [...counts.entries()].map(([name, usageCount]) => ({
    name,
    slug: generateSlug(name),
    usageCount,
  }));
}

/**
 * Group rows that share a name into variant groups.
 *
 * A shared `Найменування` with differing `Дизайн` is how the supplier expresses
 * colours of one item; the shop models that as a ProductGroup with a `color`
 * axis and one Product position per colour. A name used by a single row is a
 * standalone product and gets no group.
 */
function buildGroups(rows: ParsedProductRow[]): PlannedGroup[] {
  const byName = new Map<string, string[]>();
  for (const row of rows) {
    const skus = byName.get(row.name);
    if (skus) {
      skus.push(row.sourceSku);
    } else {
      byName.set(row.name, [row.sourceSku]);
    }
  }
  return [...byName.entries()]
    .filter(([, skus]) => skus.length > 1)
    .map(([name, sourceSkus]) => ({ name, sourceSkus }));
}
