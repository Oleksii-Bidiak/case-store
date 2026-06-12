// Category entity — domain types, API hooks, and query-key getters.
// Re-exports the Orval-generated admin-category client from the shared layer so
// the rest of the app depends on `@/entities/category` rather than reaching into
// `@/shared/api` directly.

export {
  useAdminCategoryControllerFindAllWithProductCount,
  useAdminCategoryControllerFindById,
  useAdminCategoryControllerCreate,
  useAdminCategoryControllerUpdate,
  useAdminCategoryControllerDeactivate,
  useAdminCategoryControllerActivate,
  getAdminCategoryControllerFindAllWithProductCountQueryKey,
  getAdminCategoryControllerFindByIdQueryKey,
} from "@/shared/api";

export type {
  CategoryEntity,
  CategoryWithCountEntity,
  CreateCategoryDto,
  UpdateCategoryDto,
  AdminCategoryControllerFindAllWithProductCountParams,
  AdminCategoryListResponse,
} from "@/shared/api";
