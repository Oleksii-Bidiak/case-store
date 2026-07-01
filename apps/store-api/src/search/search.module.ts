import { Module } from '@nestjs/common';
import { ProductRepository } from '../product/product.repository';
import { MeiliClient } from './meili.client';
import { SearchService } from './search.service';
import { ProductIndexer, SearchProductIndexer } from './product-indexer';
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
  controllers: [SearchController, AdminSearchController],
  providers: [
    MeiliClient,
    SearchService,
    ProductRepository,
    { provide: ProductIndexer, useClass: SearchProductIndexer },
  ],
  exports: [ProductIndexer, SearchService],
})
export class SearchModule {}
