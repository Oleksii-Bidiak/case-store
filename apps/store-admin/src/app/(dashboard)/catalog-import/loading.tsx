// Imported from the slice, as the page does — not through the `@/widgets` barrel.
import { CatalogImportSkeleton } from "@/widgets/catalog-import-view";

/** Route-level loading UI for `/catalog-import` (ІК14, canon 1.7). */
export default function Loading() {
  return <CatalogImportSkeleton />;
}
