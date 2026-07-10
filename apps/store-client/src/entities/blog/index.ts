// Blog entity — re-exports generated blog types and API hooks (FSD entities
// layer). Upper layers (features/widgets) import blog data access from here,
// never from the generated client directly.
export type {
  BlogControllerFindAllParams,
  BlogPostEntity,
} from "@/shared/api/generated/models";

export {
  useBlogControllerFindAll,
  getBlogControllerFindAllQueryKey,
} from "@/shared/api/generated/blog/blog";
