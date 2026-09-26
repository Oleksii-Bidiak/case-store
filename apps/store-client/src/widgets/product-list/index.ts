export { ProductListView } from "./ui/product-list-view";
export { ProductListSkeleton } from "./ui/product-list-skeleton";
// Pure category-tree helpers the listing routes' server code reads for the
// breadcrumbs and headings (TASK-828 — they used to be deep-imported).
export {
  buildCatalogHeader,
  findCategoryName,
  findCategoryNodeBySlug,
  findCategoryPathBySlug,
  type CatalogHeader,
  type Crumb,
} from "./model/catalog-header";
