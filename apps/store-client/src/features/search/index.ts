export { SearchAutocomplete } from "./ui/search-autocomplete";
export { SearchSuggestionsPopup } from "./ui/search-suggestions-popup";
export {
  useSearchAutocomplete,
  SEARCH_MIN_QUERY_LENGTH,
  BLOG_SUGGEST_LIMIT,
} from "./model/use-search-autocomplete";

// Device-model recognition in a query (TASK-2069): the classifier and the
// Д3-2 device-block rules, shared by the header popup and the /search row.
export {
  MAX_MODEL_ALTERNATIVES,
  classifyDeviceQuery,
  deviceBlockPlacement,
  parseDeviceQuery,
  showNotSoldLine,
  type DeviceBlockPlacement,
  type DeviceQueryMatch,
  type ParsedDeviceQuery,
  type ProductWordKey,
} from "./model/classify-device-query";
export {
  useSearchDeviceModel,
  type SearchDeviceMatch,
  type SearchDeviceModel,
} from "./model/use-search-device-model";
export {
  useModelDeviceState,
  type ModelDeviceState,
  type ModelDeviceStatus,
} from "./model/use-model-device-state";
export {
  deviceHubHref,
  deviceKindOf,
  deviceLandingHref,
  searchHref,
  type DeviceKind,
} from "./model/device-links";
export {
  DeviceKindIcon,
  ModelDeviceAction,
  SEARCH_DEVICE_FOCUS,
} from "./ui/model-device-action";
