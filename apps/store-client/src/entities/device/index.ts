// Device entity — re-exports generated types and API hooks (FSD entities layer).
// Device-compatibility taxonomy (TASK-190): feeds the homepage ModelPicker and
// the catalog "Сумісний пристрій" filter cascade.
export type {
  DeviceBrandEntity,
  DeviceModelEntity,
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
