// Brand entity — domain types, API hooks, and query-key getters.
// Re-exports the Orval-generated brand client from the shared layer so the rest
// of the app depends on `@/entities/brand` rather than reaching into
// `@/shared/api` directly.

export {
  useBrandControllerAdminFindAll,
  useBrandControllerFindById,
  useAdminBrandControllerCreate,
  useAdminBrandControllerUpdate,
  useAdminBrandControllerSetStatus,
  getBrandControllerAdminFindAllQueryKey,
  getBrandControllerFindByIdQueryKey,
} from "@/shared/api";

export type {
  BrandEntity,
  CreateBrandDto,
  UpdateBrandDto,
  UpdateBrandStatusDto,
  BrandControllerAdminFindAllParams,
  AdminBrandListResponse,
} from "@/shared/api";
