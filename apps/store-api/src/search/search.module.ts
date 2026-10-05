import { Module, forwardRef } from '@nestjs/common';
// eslint-disable-next-line local/no-deep-module-import -- cycle: product barrel > product.module > search barrel > this file
import { ProductRepository } from '../product/product.repository';
// Same rule as ProductRepository below: the blog index needs a BlogRepository,
// and providing it here (rather than importing BlogModule) keeps the dependency
// edge one-directional — BlogModule imports SearchModule for the BlogIndexer
// seam, never the other way round.
// eslint-disable-next-line local/no-deep-module-import -- cycle: blog barrel > blog.module > this file. (BlogRepository is not in BlogModule.exports either; provided module-locally — TASK-827)
import { BlogRepository } from '../blog/blog.repository';
// Direct file imports (NOT the '../category' barrel): CategoryModule and SearchModule now
// form a module cycle, and routing these through the barrels would make the emitted
// design:paramtypes of SearchService's CategoryRepository resolve to `Object` at runtime.
import { CategoryModule } from '../category/category.module';
// Same rule as ProductRepository: BrandRepository and DeviceRepository are
// stateless Prisma wrappers, so the slug → id resolver's two extra dependencies
// are provided module-locally rather than by importing BrandModule/DeviceModule
// — no new edge into the CategoryModule ↔ SearchModule forwardRef cycle.
// eslint-disable-next-line local/no-deep-module-import -- cycle: brand barrel > brand.module > category.module > this file
import { BrandRepository } from '../brand/brand.repository';
import { DeviceRepository } from '../device';
import { CatalogueFilterResolver } from '../catalog-filter';
import { SlugRedirectModule } from '../slug-redirect';
import { SearchSynonymsModule } from '../search-synonyms/search-synonyms.module';
import { CategorySubtreeIndexer } from '../common/ports';
import { MeiliClient } from './meili.client';
import { SearchService } from './search.service';
import { ProductIndexer, SearchProductIndexer } from './product-indexer';
import { BlogSearchService } from './blog-search.service';
import { BlogIndexer, SearchBlogIndexer } from './blog-indexer';
import { SearchCategorySubtreeIndexer } from './category-subtree-indexer';
import { SearchController } from './search.controller';
import { AdminSearchController } from './admin-search.controller';

/**
 * SearchModule — Meilisearch full-text search (TASK-075).
 *
 * Owns the {@link MeiliClient} wrapper, the {@link SearchService} (index
 * lifecycle + query with Postgres fallback), and the public/admin controllers.
 *
 * It provides its OWN {@link ProductRepository} instance (a stateless Prisma
 * wrapper) rather than importing `ProductModule` — that keeps the dependency
 * edge one-directional: `ProductModule` imports `SearchModule` for the
 * {@link ProductIndexer} seam, avoiding a circular module reference.
 */
@Module({
  // CategoryModule supplies CategoryRepository for the TASK-236 ancestor-id
  // expansion in `toDocument`. ProductRepository stays module-local (see below).
  // SlugRedirectModule supplies SlugRedirectRepository — a constructor
  // dependency of the module-local ProductRepository since TASK-285-G.
  // The CategoryModule edge is now a CYCLE (TASK-291): CategoryModule needs the
  // CategorySubtreeIndexer seam exported here, so BOTH sides use `forwardRef`.
  // SearchSynonymsModule (TASK-559) supplies the admin-edited synonym map both
  // index settings and document `searchTerms` are built from. One-directional:
  // it never imports this module back.
  imports: [forwardRef(() => CategoryModule), SlugRedirectModule, SearchSynonymsModule],
  controllers: [SearchController, AdminSearchController],
  providers: [
    MeiliClient,
    SearchService,
    ProductRepository,
    BrandRepository,
    DeviceRepository,
    CatalogueFilterResolver,
    BlogRepository,
    BlogSearchService,
    { provide: ProductIndexer, useClass: SearchProductIndexer },
    { provide: BlogIndexer, useClass: SearchBlogIndexer },
    { provide: CategorySubtreeIndexer, useClass: SearchCategorySubtreeIndexer },
  ],
  exports: [ProductIndexer, BlogIndexer, CategorySubtreeIndexer, SearchService],
})
export class SearchModule {}
