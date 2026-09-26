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
// The listing query of a catalogue URL — the server page prefetches with it and
// the view reads with it, so both hold the same React Query key (TASK-563).
export {
  buildCatalogListingParams,
  readSearchParamsRecord,
  CATALOG_PAGE_SIZE,
  type ListingLocks,
  type ListingParamReader,
} from "./model/listing-params";
