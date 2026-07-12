import { Module, forwardRef } from '@nestjs/common';
import { ProductRepository } from '../product/product.repository';
// Direct file imports (NOT the '../category' barrel): CategoryModule and SearchModule now
// form a module cycle, and routing these through the barrels would make the emitted
// design:paramtypes of SearchService's CategoryRepository resolve to `Object` at runtime.
import { CategoryModule } from '../category/category.module';
import { SlugRedirectModule } from '../slug-redirect';
import { CategorySubtreeIndexer } from '../common/ports/category-subtree-indexer.port';
import { MeiliClient } from './meili.client';
import { SearchService } from './search.service';
import { ProductIndexer, SearchProductIndexer } from './product-indexer';
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
  imports: [forwardRef(() => CategoryModule), SlugRedirectModule],
  controllers: [SearchController, AdminSearchController],
  providers: [
    MeiliClient,
    SearchService,
    ProductRepository,
    { provide: ProductIndexer, useClass: SearchProductIndexer },
    { provide: CategorySubtreeIndexer, useClass: SearchCategorySubtreeIndexer },
  ],
  exports: [ProductIndexer, CategorySubtreeIndexer, SearchService],
})
export class SearchModule {}
