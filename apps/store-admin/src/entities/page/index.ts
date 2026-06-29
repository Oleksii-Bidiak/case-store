// Page entity — domain types, API hooks, and query-key getters.
// Re-exports the Orval-generated page client from the shared layer so the rest
// of the app depends on `@/entities/page` rather than reaching into
// `@/shared/api` directly.

export {
  useAdminPageControllerFindAll,
  useAdminPageControllerFindById,
  useAdminPageControllerCreate,
  useAdminPageControllerUpdate,
  useAdminPageControllerPublish,
  useAdminPageControllerUnpublish,
  useAdminPageControllerDelete,
  getAdminPageControllerFindAllQueryKey,
  getAdminPageControllerFindByIdQueryKey,
} from "@/shared/api";

export type {
  PageEntity,
  CreatePageDto,
  UpdatePageDto,
  AdminPageControllerFindAllParams,
  AdminPageListResponse,
} from "@/shared/api";
