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
  useAdminCategoryControllerReorder,
  useAdminCategoryControllerSetStatusMany,
  useCategoryControllerGetAdminTree,
  useCategoryControllerGetCategoryTree,
  // Wave 198 (TASK-1087): the PUBLIC read by slug — 404 for a hidden category,
  // which is exactly what «Категорія показується» on the product overview asks.
  useCategoryControllerFindBySlug,
  getAdminCategoryControllerFindAllWithProductCountQueryKey,
  getAdminCategoryControllerFindByIdQueryKey,
  getCategoryControllerGetAdminTreeQueryKey,
  getCategoryControllerGetAdminTreeQueryOptions,
} from "@/shared/api";

export {
  flattenAdminCategoryTree,
  type CategoryTreeItem,
} from "./lib/flatten-admin-tree";

export { categoryNamesById } from "./lib/category-names";

export type {
  CategoryEntity,
  CategoryWithCountEntity,
  CreateCategoryDto,
  UpdateCategoryDto,
  AdminCategoryControllerFindAllWithProductCountParams,
  AdminCategoryListResponse,
  AdminCategoryTreeNodeEntity,
  AdminCategoryTreeResponse,
  ReorderCategoriesDto,
  ReorderGroupDto,
  BulkCategoryStatusDto,
} from "@/shared/api";
