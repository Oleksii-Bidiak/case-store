import { Injectable, OnModuleInit } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { ProductRepository, ProductIndexSource } from '../product/product.repository';
import { CategoryRepository } from '../category';
import { PublicProductEntity } from '../product/entities';
import { MeiliClient, ProductSearchDocument, IndexSettings } from './meili.client';
import { UA_EN_SYNONYMS, extractUaSearchTerms } from './search-synonyms';
import { SearchSuggestionEntity } from './entities';

/** Default page size for the `/search` results grid. */
export const DEFAULT_SEARCH_LIMIT = 20;
/** Number of autocomplete suggestions returned by `/search/suggest`. */
export const SUGGEST_LIMIT = 6;
/** Batch size for the full reindex pull. */
const REINDEX_BATCH = 100;

/**
 * Index configuration applied on bootstrap. Searchable across name, description,
 * category and the injected UA `searchTerms` (last, so direct name/description
 * matches rank higher); filterable by visibility + category; sortable by
 * price/recency.
 *
 * UA↔EN support (TASK-200) is two-fold because Meilisearch synonym expansion
 * is exact-word only (not typo tolerant): `synonyms` covers correctly-typed
 * cross-script queries («айфон» → iphone), while the per-document `searchTerms`
 * attribute (see `toDocument`) puts the UA tokens into the index so typo
 * tolerance itself covers misspellings («афйон» → «айфон»).
 */
export const PRODUCTS_INDEX_SETTINGS: IndexSettings = {
  searchableAttributes: ['name', 'description', 'categoryName', 'searchTerms'],
  filterableAttributes: ['isActive', 'categoryIds', 'deviceModelIds'],
  sortableAttributes: ['price', 'createdAt'],
  rankingRules: ['words', 'typo', 'proximity', 'attribute', 'sort', 'exactness'],
  typoTolerance: {
    enabled: true,
    minWordSizeForTypos: { oneTypo: 4, twoTypos: 8 },
  },
  synonyms: UA_EN_SYNONYMS,
};

/** Pagination metadata returned with a search result page. */
export interface SearchMeta {
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

/** Paginated search results — same envelope shape as the product list. */
export interface SearchResults {
  data: PublicProductEntity[];
  meta: SearchMeta;
}

/**
 * SearchService — owns the product search index lifecycle AND the query path
 * with transparent Postgres fallback (TASK-075).
 *
 * Index sync (`indexProduct` / `removeProduct` / `reindexAll`) keeps Meilisearch
 * in step with product mutations. The query methods (`search` / `suggest`) try
 * Meilisearch first and fall back to the existing Postgres `contains` scan
 * (via {@link ProductRepository}) whenever the engine is unconfigured or the
 * request fails — so the storefront keeps working with no engine and the
 * response shape is identical either way.
 *
 * On bootstrap it ensures the index + settings exist and best-effort reindexes,
 * all guarded so a down engine never crashes startup.
 */
@Injectable()
export class SearchService implements OnModuleInit {
  constructor(
    private readonly meili: MeiliClient,
    private readonly productRepository: ProductRepository,
    private readonly categoryRepository: CategoryRepository,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(SearchService.name);
  }

  /** Bootstrap: ensure the index + settings, then best-effort self-populate. */
  async onModuleInit(): Promise<void> {
    if (!this.meili.isConfigured()) {
      this.logger.info('Meilisearch not configured — search falls back to Postgres');
      return;
    }
    await this.ensureIndex();
    // Fire-and-forget so a slow/down engine never blocks app boot.
    void this.reindexAll().catch((err) =>
      this.logger.warn({ err }, 'Bootstrap reindex failed (non-fatal)'),
    );
  }

  /** Apply the index settings (idempotent, best-effort). */
  async ensureIndex(): Promise<void> {
    await this.meili.ensureIndex(PRODUCTS_INDEX_SETTINGS);
  }

  /**
   * Upsert a product into the index. Loads a fresh, public-safe source; if the
   * product is not indexable (missing / soft-deleted / deactivated) it is
   * removed from the index instead.
   */
  async indexProduct(productId: string): Promise<void> {
    if (!this.meili.isConfigured()) return;
    const source = await this.productRepository.findOneForIndex(productId);
    if (!source) {
      await this.meili.deleteDocument(productId);
      return;
    }
    await this.meili.indexDocuments([await this.toDocument(source)]);
  }

  /** Remove a product from the index (deactivate / delete). */
  async removeProduct(productId: string): Promise<void> {
    if (!this.meili.isConfigured()) return;
    await this.meili.deleteDocument(productId);
  }

  /**
   * Full reindex: clear the index and re-add every active product in batches.
   * Used on bootstrap and by the admin reindex endpoint for drift recovery.
   * Returns the number of documents indexed.
   */
  async reindexAll(): Promise<number> {
    if (!this.meili.isConfigured()) return 0;
    await this.ensureIndex();
    await this.meili.clearDocuments();

    let skip = 0;
    let indexed = 0;
    for (;;) {
      const { items } = await this.productRepository.findManyForIndex(skip, REINDEX_BATCH);
      if (items.length === 0) break;
      const docs = await Promise.all(items.map((item) => this.toDocument(item)));
      await this.meili.indexDocuments(docs);
      indexed += items.length;
      if (items.length < REINDEX_BATCH) break;
      skip += REINDEX_BATCH;
    }
    this.logger.info({ indexed }, 'Meilisearch reindex complete');
    return indexed;
  }

  /**
   * Paginated product search. Meilisearch returns ranked, typo-tolerant matches
   * as ids which are hydrated into full product cards; on any miss it falls back
   * to the Postgres `contains` scan.
   */
  async search(rawQuery: string, page = 1, limit = DEFAULT_SEARCH_LIMIT): Promise<SearchResults> {
    const query = (rawQuery ?? '').trim();
    const pageNum = page > 0 ? page : 1;
    const pageSize = limit > 0 ? limit : DEFAULT_SEARCH_LIMIT;

    if (this.meili.isConfigured()) {
      const result = await this.meili.search(query, {
        limit: pageSize,
        offset: (pageNum - 1) * pageSize,
        filter: ['isActive = true'],
      });
      if (result) {
        const ids = result.hits.map((hit) => hit.id);
        const products = await this.productRepository.findByIdsForCards(ids);
        const byId = new Map(products.map((p) => [p.id, p]));
        // Preserve Meilisearch's relevance ordering.
        const data = ids
          .map((id) => byId.get(id))
          .filter((p): p is NonNullable<typeof p> => p != null)
          .map((p) => PublicProductEntity.fromPrisma(p));
        return { data, meta: this.buildMeta(result.estimatedTotalHits, pageNum, pageSize) };
      }
    }

    return this.postgresSearch(query, pageNum, pageSize);
  }

  /**
   * Lightweight autocomplete suggestions. Meilisearch first (from the index,
   * no DB hit), else a small Postgres `contains` scan. Returns `[]` for a blank
   * query.
   */
  async suggest(rawQuery: string): Promise<SearchSuggestionEntity[]> {
    const query = (rawQuery ?? '').trim();
    if (query.length === 0) return [];

    if (this.meili.isConfigured()) {
      const result = await this.meili.search(query, {
        limit: SUGGEST_LIMIT,
        filter: ['isActive = true'],
      });
      if (result) {
        return result.hits.map((hit) => ({
          id: hit.id,
          name: hit.name,
          slug: hit.slug,
          price: String(hit.price),
          compareAtPrice: hit.compareAtPrice != null ? String(hit.compareAtPrice) : null,
          primaryImageUrl: hit.primaryImageUrl,
        }));
      }
    }

    const { products } = await this.productRepository.findAll({
      page: 1,
      limit: SUGGEST_LIMIT,
      isActive: true,
      search: query,
      sortBy: 'createdAt',
      sortOrder: 'desc',
    });
    return products.map((p) => ({
      id: p.id,
      name: p.name,
      slug: p.slug,
      price: p.price.toString(),
      compareAtPrice: p.compareAtPrice ? p.compareAtPrice.toString() : null,
      primaryImageUrl: p.primaryImage?.url ?? null,
    }));
  }

  /** Postgres `contains` fallback for the results page (current behaviour). */
  private async postgresSearch(query: string, page: number, limit: number): Promise<SearchResults> {
    const { products, total } = await this.productRepository.findAll({
      page,
      limit,
      isActive: true,
      search: query || undefined,
      sortBy: 'createdAt',
      sortOrder: 'desc',
    });
    return {
      data: products.map((p) => PublicProductEntity.fromPrisma(p)),
      meta: this.buildMeta(total, page, limit),
    };
  }

  /**
   * Build a Meilisearch document from an index source (Decimal → number).
   * `categoryIds` is expanded to the product's category plus every ancestor id
   * (TASK-236) so a category-scoped filter rolls up subcategory products, just
   * like the Postgres subtree rollup.
   */
  private async toDocument(source: ProductIndexSource): Promise<ProductSearchDocument> {
    const categoryIds = await this.categoryRepository.findAncestorIds(source.categoryId);
    return {
      id: source.id,
      name: source.name,
      description: source.description,
      slug: source.slug,
      price: Number(source.price.toString()),
      compareAtPrice:
        source.compareAtPrice != null ? Number(source.compareAtPrice.toString()) : null,
      categoryIds,
      deviceModelIds: source.deviceModelIds,
      categoryName: source.categoryName,
      primaryImageUrl: source.primaryImageUrl,
      blurDataUrl: source.blurDataUrl,
      inStock: source.stock > 0,
      isActive: source.isActive,
      createdAt: source.createdAt.getTime(),
      searchTerms: extractUaSearchTerms(`${source.name} ${source.categoryName}`),
    };
  }

  private buildMeta(total: number, page: number, limit: number): SearchMeta {
    return { total, page, limit, totalPages: Math.ceil(total / limit) };
  }
}
