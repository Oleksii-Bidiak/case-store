import type { Metadata } from "next";
import { CatalogImportView } from "@/widgets/catalog-import-view";
import { dict } from "@/shared/config";

export const metadata: Metadata = { title: dict.catalogImport.heading };

/**
 * Supplier-catalogue import (TASK-360). The route is guarded server-side by the
 * `catalog:import` permission on every endpoint the view calls; the nav entry
 * hides itself for staff without it.
 */
export default function CatalogImportPage() {
  return <CatalogImportView />;
}
