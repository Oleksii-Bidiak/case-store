// Shared admin-table controls (TASK-423). One search idiom, one filter idiom,
// one page size — see each module's header for why.
export {
  SEARCH_DEBOUNCE_MS,
  TableSearch,
  type TableSearchProps,
} from "./table-search";
export {
  FILTER_ALL_VALUE,
  SELECT_PANEL_CLASS,
  TableFilters,
  type TableFilterDef,
  type TableFilterOption,
  type TableFiltersProps,
} from "./table-filters";
export {
  DEFAULT_PAGE_SIZE,
  PAGE_SIZE_OPTIONS,
  PAGE_SIZE_PARAM,
  PageSizeSelect,
  pageSizeFrom,
  type PageSizeSelectProps,
} from "./page-size-select";
export { TablePagination, type TablePaginationProps } from "./table-pagination";
