// Device entity — domain types, API hooks, and query-key getters (TASK-190).
// Re-exports the Orval-generated device client (public + admin) from the shared
// layer so the rest of the admin app depends on `@/entities/device`.

export {
  // Public taxonomy (used by the product-form compat multiselect cascade).
  useDeviceControllerFindBrands,
  useDeviceControllerFindModels,
  getDeviceControllerFindBrandsQueryKey,
  getDeviceControllerFindModelsQueryKey,
  // Admin CRUD — device brands.
  useAdminDeviceControllerFindBrands,
  useAdminDeviceControllerFindBrandById,
  useAdminDeviceControllerCreateBrand,
  useAdminDeviceControllerUpdateBrand,
  useAdminDeviceControllerActivateBrand,
  useAdminDeviceControllerDeactivateBrand,
  useAdminDeviceControllerReorderBrands,
  getAdminDeviceControllerFindBrandsQueryKey,
  getAdminDeviceControllerFindBrandsQueryOptions,
  getAdminDeviceControllerFindBrandByIdQueryKey,
  // Admin CRUD — device models.
  useAdminDeviceControllerFindModels,
  useAdminDeviceControllerFindModelById,
  useAdminDeviceControllerCreateModel,
  useAdminDeviceControllerUpdateModel,
  useAdminDeviceControllerActivateModel,
  useAdminDeviceControllerDeactivateModel,
  getAdminDeviceControllerFindModelsQueryKey,
  getAdminDeviceControllerFindModelByIdQueryKey,
  // Product compat writes (used by the product form).
  useProductControllerUpdateDeviceCompat,
  useProductControllerUpdateGroupDeviceCompat,
} from "@/shared/api";

export type {
  DeviceBrandEntity,
  DeviceModelEntity,
  DeviceBrandListResponse,
  DeviceModelListResponse,
  AdminDeviceBrandListResponse,
  AdminDeviceModelListResponse,
  ReorderDeviceBrandsDto,
  CreateDeviceBrandDto,
  UpdateDeviceBrandDto,
  CreateDeviceModelDto,
  UpdateDeviceModelDto,
  SetDeviceCompatDto,
  ProductCompatibleDeviceEntity,
  AdminDeviceControllerFindModelsParams,
  DeviceControllerFindModelsParams,
} from "@/shared/api";
