// Category entity — re-exports generated types and API hooks (FSD entities layer).
export type {
  CategoryEntity,
  CategoryTreeNodeEntity,
  CategoryTreeResponse,
  CategoryListResponse,
  CategoryControllerGetRootCategoriesParams,
} from "@/shared/api/generated/models";

export {
  useCategoryControllerGetRootCategories,
  getCategoryControllerGetRootCategoriesQueryKey,
  useCategoryControllerGetCategoryTree,
  getCategoryControllerGetCategoryTreeQueryKey,
} from "@/shared/api/generated/categories/categories";
