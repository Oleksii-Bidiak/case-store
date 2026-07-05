// Banner entity — domain types, API hooks, and query-key getters.
// Re-exports the Orval-generated banner client from the shared layer so the rest
// of the app depends on `@/entities/banner` rather than reaching into
// `@/shared/api` directly.

export {
  useAdminBannerControllerFindAll,
  useAdminBannerControllerFindById,
  useAdminBannerControllerCreate,
  useAdminBannerControllerUpdate,
  useAdminBannerControllerPublish,
  useAdminBannerControllerUnpublish,
  useAdminBannerControllerDelete,
  getAdminBannerControllerFindAllQueryKey,
  getAdminBannerControllerFindByIdQueryKey,
} from "@/shared/api";

export type {
  BannerEntity,
  CreateBannerDto,
  UpdateBannerDto,
  AdminBannerControllerFindAllParams,
  AdminBannerListResponse,
} from "@/shared/api";

export { BannerEntityPlacement } from "@/shared/api";
