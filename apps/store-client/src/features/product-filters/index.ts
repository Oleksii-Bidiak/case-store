export { ProductFilters } from "./ui/product-filters";
export { ActiveFilterChips } from "./ui/active-filter-chips";
export { DeviceModelFilter } from "./ui/device-model-filter";
export { SpecFacets } from "./ui/spec-facets";
export { CategoryChips } from "./ui/category-chips";
export { SortSelect } from "./ui/sort-select";
export { ViewToggle, type CatalogView } from "./ui/view-toggle";
export { FilterCheckbox } from "./ui/filter-checkbox";
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
