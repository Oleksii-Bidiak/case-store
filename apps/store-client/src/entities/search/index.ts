// Search entity — re-exports generated search types and API hooks (FSD entities
// layer). Upper layers (features/widgets) import search data access from here,
// never from the generated client directly.
export type {
  SearchParams,
  SearchSuggestParams,
  SearchResultsResponse,
  SearchSuggestResponse,
  SearchSuggestionEntity,
  SearchMetaDto,
} from "@/shared/api/generated/models";

export {
  useSearch,
  getSearchQueryKey,
  useSearchSuggest,
  getSearchSuggestQueryKey,
} from "@/shared/api/generated/search/search";
