// Search-synonyms entity (TASK-559) — the list of words the shop's search
// treats as the same word («чохол» ↔ «case»), edited on /settings/search.
//
// Re-exports the Orval-generated client from the shared layer so features and
// widgets depend on `@/entities/search-synonyms` rather than reaching into
// `@/shared/api`. A separate entity from `@/entities/search`, which is only the
// reindex action: the synonym list is data the owner curates, not maintenance.

export {
  useAdminGetSearchSynonyms,
  useAdminUpdateSearchSynonyms,
  getAdminGetSearchSynonymsQueryKey,
} from "@/shared/api";

export type {
  SearchSynonymsEntity,
  SearchSynonymGroupEntity,
  SearchSynonymsResponseEnvelope,
  SearchSynonymsSaveResultEntity,
  UpdateSearchSynonymsDto,
} from "@/shared/api";
