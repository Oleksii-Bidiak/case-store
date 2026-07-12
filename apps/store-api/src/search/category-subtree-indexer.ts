import { Injectable } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { CategorySubtreeIndexer } from '../common/ports/category-subtree-indexer.port';
import { CategoryRepository } from '../category/category.repository';
import { ProductRepository } from '../product/product.repository';
import { SearchService } from './search.service';

/**
 * Meilisearch-backed {@link CategorySubtreeIndexer} (TASK-291, plan 158 §3.13.2).
 *
 * A product document carries `categoryIds` = its category's ANCESTOR CHAIN, resolved at
 * index time (`search.service.ts` → `toDocument`). Re-parenting a category therefore
 * invalidates that chain for every product filed anywhere in its subtree — nothing else
 * in the app re-indexes on a category write, so category-filtered storefront search would
 * silently return the wrong products.
 *
 * Best-effort by contract: every failure is logged and swallowed, so a Meilisearch outage
 * can never fail the admin reorder request. The reindex endpoint / bootstrap reconcile
 * repairs any drift.
 */
@Injectable()
export class SearchCategorySubtreeIndexer extends CategorySubtreeIndexer {
  constructor(
    private readonly searchService: SearchService,
    private readonly categoryRepository: CategoryRepository,
    private readonly productRepository: ProductRepository,
    private readonly logger: PinoLogger,
  ) {
    super();
    this.logger.setContext(SearchCategorySubtreeIndexer.name);
  }

  async reindexSubtrees(rootCategoryIds: string[]): Promise<void> {
    if (rootCategoryIds.length === 0) return;

    try {
      const subtrees = await Promise.all(
        rootCategoryIds.map((id) => this.categoryRepository.findSubtreeIds(id)),
      );
      const categoryIds = [...new Set(subtrees.flat())];
      const productIds = await this.productRepository.findIdsByCategoryIds(categoryIds);

      for (const productId of productIds) {
        try {
          await this.searchService.indexProduct(productId);
        } catch (err) {
          this.logger.warn({ err, productId }, 'Best-effort subtree product index failed');
        }
      }
    } catch (err) {
      this.logger.warn({ err, rootCategoryIds }, 'Best-effort category subtree reindex failed');
    }
  }
}
