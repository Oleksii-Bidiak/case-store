export { ProductFilters } from "./ui/product-filters";
// «З урахуванням моїх пристроїв» (TASK-2077): the panel lives inside
// ProductFilters; the listing reads the same state for its empty state, and
// the cards (K2, device-fit) can read which devices the filter names.
export { MyDevicesEmptyState } from "./ui/my-devices-empty-state";
// …and its switch, which the wishlist rail's simpler device panel reuses
// (TASK-1300 — no radios there, on/off only).
export { MyDevicesSwitch } from "./ui/my-devices-switch";
export {
  CATALOG_MY_DEVICES_DEFAULT,
  COMPAT_PARAM,
  MAX_DEVICE_FILTER_SLUGS,
  allMyDevicesParam,
  catalogDeviceParam,
  isMyDevicesFilterOn,
  parseDeviceParam,
  resolveMyDevicesFilter,
  withCompatMarker,
  type MyDevicesFilterDefault,
  type MyDevicesFilterState,
} from "./model/my-devices-filter";
export {
  useCatalogDeviceParam,
  useMyDevicesFilter,
  type MyDevicesFilter,
} from "./model/use-my-devices-filter";
export { ActiveFilterChips } from "./ui/active-filter-chips";
// Presentational pieces shared with the wishlist rail (TASK-1300): the chip row
// and the inputs + two-thumb price slider, each fed by its caller's own state.
export { FilterChipList, type FilterChip } from "./ui/filter-chip-list";
export { PriceRangeFilter } from "./ui/price-range-filter";
export { DeviceModelFilter } from "./ui/device-model-filter";
export { SpecFacets } from "./ui/spec-facets";
// The category tree (TASK-2011, «дерево в рейці»): the rail panel, its
// placeholder, and the same tree in a bottom sheet below `lg`.
export { CategoryTree } from "./ui/category-tree";
export {
  CategoryTreePanel,
  CategoryTreePanelSkeleton,
} from "./ui/category-tree-panel";
export { CategoryTreeSheet } from "./ui/category-tree-sheet";
// One filter card's placeholder (TASK-515): the catalogue skeleton's rail and
// the brand / spec cards' own pending state are the same box.
export {
  FilterCardSkeleton,
  FilterPanelSkeleton,
} from "./ui/filter-card-skeleton";
// The tree's rows, its row count (what the skeleton reserves) and its links.
export {
  categoryTreeView,
  categoryTreeRowCount,
  categoryTreeHref,
  subcategoryCount,
  type CategoryTreeView,
  type CategoryTreeHrefOptions,
} from "./model/category-tree";
export { SortSelect, type SortOption } from "./ui/sort-select";
export { ViewToggle, type CatalogView } from "./ui/view-toggle";
export { FilterCheckbox } from "./ui/filter-checkbox";
// The one mobile filter drawer (TASK-804) — catalogue, /search and wishlist.
export { FiltersDrawer } from "./ui/filters-drawer";
// …and the toolbar button that opens it (TASK-876).
export { FiltersButton } from "./ui/filters-button";
// The one empty state of a product listing (TASK-870, design-system §6).
export {
  ListingEmptyState,
  type ListingEmptyStateAction,
  type ListingEmptyStateProps,
} from "./ui/listing-empty-state";
// The count line under the catalogue H1 (Д3-2 Catalog §3).
export {
  ListingCountLine,
  listingCountText,
  type ListingCountLineProps,
} from "./ui/listing-count-line";
// The single definition of "the catalogue filters" (TASK-414) — widgets count
// and clear through these rather than re-listing the params.
export {
  CATALOG_FILTER_KEYS,
  activeFilterKeys,
  countActiveFilters,
  hasActiveFilters,
  clearFilterUpdates,
  type CatalogFilterKey,
} from "./model/active-filters";
// Listing params → facet-request params (TASK-489): one mapping, so every
// caller of the facet endpoint shares one React Query key and one request.
export { toFacetQueryParams } from "./model/facet-query";
// The rail's section order (TASK-515) — the panel gates on it and the catalogue
// skeleton draws its placeholder cards from it, so the two cannot drift.
export {
  FILTER_SECTION_ORDER,
  filterRailSections,
  type FilterSectionId,
  type FilterSectionOptions,
} from "./model/filter-sections";
