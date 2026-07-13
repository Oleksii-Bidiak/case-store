// Blog entity — domain types, API hooks, and query-key getters for the admin
// blog CMS (posts + categories). Re-exports the Orval-generated blog client from
// the shared layer so the rest of the app depends on `@/entities/blog` rather
// than reaching into `@/shared/api` directly (TASK-170 / TASK-172).

export {
  useAdminBlogControllerFindAll,
  useAdminBlogControllerFindById,
  useAdminBlogControllerCreate,
  useAdminBlogControllerUpdate,
  useAdminBlogControllerPublish,
  useAdminBlogControllerUnpublish,
  useAdminBlogControllerDelete,
  useAdminBlogControllerFindCategories,
  useAdminBlogControllerFindCategory,
  useAdminBlogControllerCreateCategory,
  useAdminBlogControllerUpdateCategory,
  useAdminBlogControllerDeleteCategory,
  useAdminBlogControllerReorderCategories,
  getAdminBlogControllerFindAllQueryKey,
  getAdminBlogControllerFindByIdQueryKey,
  getAdminBlogControllerFindCategoriesQueryKey,
  getAdminBlogControllerFindCategoriesQueryOptions,
  getAdminBlogControllerFindCategoryQueryKey,
} from "@/shared/api";

export type {
  BlogPostEntity,
  BlogCategoryEntity,
  CreateBlogPostDto,
  UpdateBlogPostDto,
  CreateBlogCategoryDto,
  UpdateBlogCategoryDto,
  AdminBlogControllerFindAllParams,
  AdminBlogPostListResponse,
  BlogCategoryListResponse,
  ReorderBlogCategoriesDto,
} from "@/shared/api";
