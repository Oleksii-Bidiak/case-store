export { SearchModule } from './search.module';
export { SearchService } from './search.service';
export { MeiliClient, PRODUCTS_INDEX, BLOG_POSTS_INDEX } from './meili.client';
export type { ProductSearchDocument, BlogPostSearchDocument } from './meili.client';
export { ProductIndexer, SearchProductIndexer } from './product-indexer';
export { BlogIndexer, SearchBlogIndexer } from './blog-indexer';
export type { BlogSearchHits } from './blog-indexer';
export { BlogSearchService, BLOG_POSTS_INDEX_SETTINGS } from './blog-search.service';
export type { BlogSearchQuery } from './blog-search.service';
export { SearchCategorySubtreeIndexer } from './category-subtree-indexer';
export { SearchSuggestionEntity } from './entities';
// The built-in synonym dictionary the admin synonyms module seeds and extends.
export {
  DEFAULT_SYNONYM_GROUPS,
  UA_EN_SYNONYMS,
  buildSynonymMap,
  type SynonymMap,
} from './search-synonyms';
// The verified full reindex, run by the `search:reindex` CLI script.
export {
  runSearchReindex,
  SearchReindexError,
  type SearchReindexDeps,
  type IndexReport,
} from './search-reindex.runner';
