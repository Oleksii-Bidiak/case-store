// Blog entity — re-exports generated blog types and API hooks (FSD entities
// layer). Upper layers (features/widgets) import blog data access from here,
// never from the generated client directly.
export type {
  BlogControllerFindAllParams,
  BlogControllerSuggestParams,
  BlogPostEntity,
  BlogPostSuggestionEntity,
} from "@/shared/api/generated/models";

export {
  useBlogControllerFindAll,
  getBlogControllerFindAllQueryKey,
  // Search-autocomplete article rows (TASK-543) — id/slug/title/cover only,
  // never the article body the list endpoint carries.
  useBlogControllerSuggest,
  getBlogControllerSuggestQueryKey,
} from "@/shared/api/generated/blog/blog";
