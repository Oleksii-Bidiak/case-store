/**
 * Client-side shape of the import plan (TASK-360).
 *
 * The API deliberately exposes `plan` as a free-form object rather than a
 * generated DTO tree — it is a review structure whose shape belongs to this
 * screen, not to the API contract, and pinning it in Swagger would mean
 * maintaining a second copy of it for no consumer's benefit. These types are
 * that copy, kept where the only consumer lives.
 *
 * Mirrors `apps/store-api/src/catalog-import/catalog-plan.ts` — change one,
 * change the other.
 */

export type RowAction = "create" | "update" | "unchanged" | "missing";

export interface FieldChange {
  field: string;
  label: string;
  /**
   * Current value. Absent for the set-valued fields (characteristics,
   * compatibility) — the import ledger keeps only hashes of what it last wrote,
   * not a copy of the supplier's data, so there is no "before" to show. The
   * decision there is a yes/no anyway, not a line-by-line comparison.
   */
  from?: string;
  to: string;
  conflict: boolean;
}

export interface PlannedRow {
  sourceSku: string;
  rowNumber: number;
  action: RowAction;
  name: string;
  productId: string | null;
  slug: string;
  changes: FieldChange[];
}

export interface PlannedEntity {
  name: string;
  slug: string;
  usageCount: number;
}

export interface PlannedGroup {
  name: string;
  sourceSkus: string[];
}

export interface ParseIssue {
  level: "error" | "warning";
  rowNumber: number;
  sourceSku: string | null;
  code: string;
  message: string;
}

export interface AttributeColumn {
  key: string;
  label: string;
  filledCount: number;
}

export interface CatalogImportPlan {
  rows: PlannedRow[];
  categories: PlannedEntity[];
  brands: PlannedEntity[];
  deviceBrands: PlannedEntity[];
  deviceModels: PlannedEntity[];
  attributeColumns: AttributeColumn[];
  groups: PlannedGroup[];
  issues: ParseIssue[];
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

/** Narrow the API's untyped `plan` field, tolerating an absent one. */
export function asPlan(value: unknown): CatalogImportPlan | null {
  if (!value || typeof value !== "object") {
    return null;
  }
  const candidate = value as Partial<CatalogImportPlan>;
  return Array.isArray(candidate.rows) && candidate.counts
    ? (value as CatalogImportPlan)
    : null;
}
