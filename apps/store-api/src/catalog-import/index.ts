export { CatalogImportModule } from './catalog-import.module';
export { CatalogImportService, type ImportDecisions } from './catalog-import.service';
export { parseXlsxCatalog, parseCatalogRows, type SheetRow } from './xlsx-catalog.parser';
export { buildImportPlan, fingerprintOf } from './catalog-plan';
export type {
  CatalogImportPlan,
  PlannedRow,
  FieldChange,
  ImportedFingerprint,
  CurrentProductSnapshot,
  LedgerEntry,
} from './catalog-plan';
export type { ParsedCatalog, ParsedProductRow, ParseIssue } from './catalog-import.types';
