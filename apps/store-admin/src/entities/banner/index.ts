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
  useAdminBannerControllerReorder,
  getAdminBannerControllerFindAllQueryKey,
  getAdminBannerControllerFindAllQueryOptions,
  getAdminBannerControllerFindByIdQueryKey,
} from "@/shared/api";

export type {
  BannerEntity,
  CreateBannerDto,
  UpdateBannerDto,
  AdminBannerControllerFindAllParams,
  AdminBannerListResponse,
  ReorderBannersDto,
} from "@/shared/api";

export { BannerEntityPlacement } from "@/shared/api";

// Wave 198 (TASK-1073): what a banner is doing on the site right now, derived
// from `status` + its publication window.
export {
  BANNER_DISPLAY_STATES,
  bannerDisplayState,
  bannerWindowLines,
  type BannerDisplayState,
} from "./lib/display-state";
export { duplicateBannerPayload } from "./lib/duplicate";
