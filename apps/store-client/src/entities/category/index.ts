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
  // The facet's definition: its label, its `type` (BOOLEAN facets store
  // "true"/"false" and render «Так»/«Ні») and its `unit` — TASK-488.
  AttributeDefinitionEntity,
} from "@/shared/api/generated/models";

export {
  useCategoryControllerGetRootCategories,
  getCategoryControllerGetRootCategoriesQueryKey,
  useCategoryControllerGetCategoryTree,
  getCategoryControllerGetCategoryTreeQueryKey,
  // Structured-spec facets (TASK-191)
  useCategoryControllerGetFilterableSpecs,
} from "@/shared/api/generated/categories/categories";
