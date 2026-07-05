// Category entity — re-exports generated types and API hooks (FSD entities layer).
export type {
  CategoryEntity,
  CategoryTreeNodeEntity,
  CategoryTreeResponse,
  CategoryListResponse,
  CategoryControllerGetRootCategoriesParams,
  // Structured-spec facets (TASK-191)
  FilterableSpecEntity,
  FilterableSpecsResponse,
} from "@/shared/api/generated/models";

export {
  useCategoryControllerGetRootCategories,
  getCategoryControllerGetRootCategoriesQueryKey,
  useCategoryControllerGetCategoryTree,
  getCategoryControllerGetCategoryTreeQueryKey,
  // Structured-spec facets (TASK-191)
  useCategoryControllerGetFilterableSpecs,
} from "@/shared/api/generated/categories/categories";
