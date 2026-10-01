export { ProductFilters } from "./ui/product-filters";
export { ActiveFilterChips } from "./ui/active-filter-chips";
// Presentational pieces shared with the wishlist rail (TASK-1300): the chip row
// and the inputs + two-thumb price slider, each fed by its caller's own state.
export { FilterChipList, type FilterChip } from "./ui/filter-chip-list";
export { PriceRangeFilter } from "./ui/price-range-filter";
export { DeviceModelFilter } from "./ui/device-model-filter";
export { SpecFacets } from "./ui/spec-facets";
export { CategoryChips } from "./ui/category-chips";
export { SortSelect, type SortOption } from "./ui/sort-select";
export { ViewToggle, type CatalogView } from "./ui/view-toggle";
export { FilterCheckbox } from "./ui/filter-checkbox";
// The one mobile filter drawer (TASK-804) — catalogue, /search and wishlist.
export { FiltersDrawer } from "./ui/filters-drawer";
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
