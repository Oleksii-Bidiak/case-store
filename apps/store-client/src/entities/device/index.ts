// Device entity — re-exports generated types and API hooks (FSD entities layer).
// Device-compatibility taxonomy (TASK-190): feeds the homepage ModelPicker and
// the catalog "Сумісний пристрій" filter cascade.
export type {
  DeviceBrandEntity,
  DeviceModelEntity,
  // The light public list item (TASK-702) — what `useDeviceControllerFindModels` returns.
  DeviceModelListItemEntity,
  DeviceBrandListResponse,
  DeviceModelListResponse,
  DeviceControllerFindModelsParams,
} from "@/shared/api/generated/models";

export {
  useDeviceControllerFindBrands,
  getDeviceControllerFindBrandsQueryKey,
  useDeviceControllerFindModels,
  getDeviceControllerFindModelsQueryKey,
} from "@/shared/api/generated/devices/devices";

// Device family → `family-*` tone (Д3 colour rule) and the typo-tolerant model
// matcher shared by the picker, the homepage hero and search (TASK-2069/2070).
export {
  DEVICE_FAMILIES,
  DEVICE_FAMILY_TONE,
  NEUTRAL_FAMILY_TONE,
  getDeviceFamily,
  getDeviceFamilyTone,
  isDeviceFamily,
  type DeviceFamily,
  type DeviceFamilySource,
  type DeviceFamilyTone,
} from "./model/device-family";

// Family hover fills (static class names) for neutral pills — TASK-2070.
export {
  DEVICE_FAMILY_HOVER_SURFACE,
  getDeviceFamilyHoverSurface,
} from "./model/device-family";

// The shared popular-ordered model list (one cached request for the picker,
// the homepage picker and search) — TASK-2070.
export {
  DEVICE_MODEL_CATALOG_PARAMS,
  useDeviceModelCatalog,
  type DeviceModelCatalog,
} from "./model/use-device-model-catalog";

export {
  damerauLevenshtein,
  detectDeviceModelInQuery,
  matchDeviceModels,
  normalizeModelQuery,
  tokenizeModelText,
  type DetectedDeviceModel,
  type DeviceModelMatch,
  type MatchableDeviceModel,
} from "./model/match-device-model";
