import { Injectable } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { SearchService } from './search.service';

/**
 * ProductIndexer — the narrow seam `ProductService` depends on to keep the
 * search index in step with product mutations, WITHOUT knowing anything about
 * Meilisearch. `ProductModule` receives the concrete {@link SearchProductIndexer}
 * (provided + exported by `SearchModule`); tests inject a mock.
 *
 * Both methods are best-effort: they resolve even when indexing fails, so a
 * product write is never blocked by a down search engine.
 */
export abstract class ProductIndexer {
  /** Upsert the product (by id) into the search index if it is active. */
  abstract index(productId: string): Promise<void>;
  /** Remove the product (by id) from the search index. */
  abstract remove(productId: string): Promise<void>;
}

/**
 * Meilisearch-backed {@link ProductIndexer}. Delegates to {@link SearchService}
 * and swallows any failure (logged) so the caller's product mutation always
 * succeeds — the reindex endpoint / bootstrap reconcile repairs any drift.
 */
@Injectable()
export class SearchProductIndexer extends ProductIndexer {
  constructor(
    private readonly searchService: SearchService,
    private readonly logger: PinoLogger,
  ) {
    super();
    this.logger.setContext(SearchProductIndexer.name);
  }

  async index(productId: string): Promise<void> {
    try {
      await this.searchService.indexProduct(productId);
    } catch (err) {
      this.logger.warn({ err, productId }, 'Best-effort product index failed');
    }
  }

  async remove(productId: string): Promise<void> {
    try {
      await this.searchService.removeProduct(productId);
    } catch (err) {
      this.logger.warn({ err, productId }, 'Best-effort product de-index failed');
    }
  }
}
