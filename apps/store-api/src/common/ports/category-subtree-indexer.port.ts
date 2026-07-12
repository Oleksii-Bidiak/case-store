/**
 * CategorySubtreeIndexer — the narrow seam `CategoryService` depends on to keep the
 * search index in step with category TREE mutations (a reparent changes every affected
 * product's `categoryIds` ancestor chain, which is computed at INDEX time), WITHOUT
 * knowing anything about Meilisearch (plan 158 §3.13.2).
 *
 * This file deliberately has ZERO imports (not even `@nestjs/common`): `SearchModule`
 * already imports `CategoryModule`, so a port living in `src/search/` would close a
 * FILE-level import cycle between the two features. The concrete
 * `SearchCategorySubtreeIndexer` is provided + exported by `SearchModule` and injected
 * into `CategoryModule` through a `forwardRef` on both sides; unit tests inject a mock.
 *
 * Best-effort by contract: implementations MUST always resolve — an indexing outage may
 * never fail an admin category write.
 */
export abstract class CategorySubtreeIndexer {
  /**
   * Re-index every product filed under the subtree of each moved category root
   * (the roots themselves plus all their descendants). A no-op for an empty list.
   */
  abstract reindexSubtrees(rootCategoryIds: string[]): Promise<void>;
}
