import { Injectable, OnModuleInit, Optional } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
// eslint-disable-next-line local/no-deep-module-import -- cycle: product barrel > product.module > search barrel > this file
import { ProductRepository, ProductIndexSource } from '../product/product.repository';
// eslint-disable-next-line local/no-deep-module-import -- cycle: category barrel > category.module > search.module > this file
import { CategoryRepository } from '../category/category.repository';
// eslint-disable-next-line local/no-deep-module-import -- cycle: product barrel > product.module > search barrel > this file
import { PublicProductEntity } from '../product/entities';
import {
  MeiliClient,
  ProductSearchDocument,
  IndexSettings,
  SEARCH_MAX_TOTAL_HITS,
} from './meili.client';
import { UA_EN_SYNONYMS, extractSearchSynonymTerms, type SynonymMap } from './search-synonyms';
import { SearchSynonymsService } from '../search-synonyms';
import { CatalogueFilterResolver } from '../catalog-filter';
import { SearchSuggestionEntity } from './entities';
import type { SearchQueryDto, SearchSort } from './dto';
import type { Paginated, PaginationMeta } from '../common/pagination';

/** Default page size for the `/search` results grid. */
export const DEFAULT_SEARCH_LIMIT = 20;
/** Number of autocomplete suggestions returned by `/search/suggest`. */
export const SUGGEST_LIMIT = 6;
/** Batch size for the full reindex pull. */
const REINDEX_BATCH = 100;

/**
 * Index configuration applied on bootstrap. Searchable across name, description,
 * category and the injected cross-script `searchTerms` (last, so direct
 * name/description matches rank higher); filterable by visibility + category;
 * sortable by price/recency.
 *
 * UA↔EN support (TASK-200) is two-fold because Meilisearch synonym expansion
 * is exact-word only (not typo tolerant): `synonyms` covers correctly-typed
 * cross-script queries («айфон» → iphone), while the per-document `searchTerms`
 * attribute (see `toDocument`) puts the missing-script tokens into the index so
 * typo tolerance itself covers misspellings («афйон» → «айфон»). Since the
 * catalogue is Ukrainian (TASK-366/367) that injection mostly runs the other way
 * — «Чохол …» gains `case`/`cases` — see `search-synonyms.ts`.
 *
 * `sku` (TASK-522) sits right after `name`: under the `attribute` ranking rule
 * a hit on an article number outranks a mention in a description. It is the one
 * attribute exempt from typo tolerance — «IP16» is one typo from «IP15», and a
 * code one character off names a different part (a wrong fit), not a misspelt
 * word. A settings change only reaches a live index through a reindex:
 * `npm run search:reindex` (see `src/scripts/search-reindex.ts`).
 *
 * `keywords` (TASK-558) follow `sku`: they are the admin's own tags (TASK-437) —
 * «ударостійкий», «подарунок» — a deliberate "this product IS about X", which
 * should outrank X merely being mentioned in a description. They stay
 * typo-tolerant (they are words, not codes) and feed `searchTerms` too, so a tag
 * typed in the other script still matches. Same reindex step as `sku`.
 */
export const PRODUCTS_INDEX_SETTINGS: IndexSettings = {
  searchableAttributes: [
    'name',
    'sku',
    'keywords',
    'description',
    'categoryName',
    'brandName',
    'searchTerms',
  ],
  // `price` and `inStock` joined the facets in TASK-417: the results page now
  // carries the catalogue's filter panel, and a price or availability filter has
  // to narrow the ENGINE's answer — filtering the hydrated page afterwards would
  // shrink the page instead of the result set and leave `total` lying.
  filterableAttributes: [
    'isActive',
    'categoryIds',
    'brandId',
    'deviceModelIds',
    'price',
    'inStock',
  ],
  sortableAttributes: ['price', 'createdAt'],
  rankingRules: ['words', 'typo', 'proximity', 'attribute', 'sort', 'exactness'],
  typoTolerance: {
    enabled: true,
    minWordSizeForTypos: { oneTypo: 4, twoTypos: 8 },
    disableOnAttributes: ['sku'],
  },
  // The BUILT-IN map. What the engine actually receives is the admin's saved
  // list (TASK-559) — `ensureIndex` overrides this field from the database.
  synonyms: UA_EN_SYNONYMS,
  // The deepest result the `/search` page list can reach (TASK-537).
  pagination: { maxTotalHits: SEARCH_MAX_TOTAL_HITS },
};

/**
 * Facets + ordering the results page may narrow by (TASK-417). Mirrors the
 * catalogue filter panel, which `/search` now renders in its own sidebar.
 */
export interface SearchFilters {
  categoryId?: string;
  brandId?: string;
  deviceModelId?: string;
  inStock?: boolean;
  minPrice?: number;
  maxPrice?: number;
  sort?: SearchSort;
}

/** True when at least one facet is applied (ordering alone does not count). */
function hasFacets(filters: SearchFilters): boolean {
  return (
    filters.categoryId != null ||
    filters.brandId != null ||
    filters.deviceModelId != null ||
    filters.inStock === true ||
    filters.minPrice != null ||
    filters.maxPrice != null
  );
}

/**
 * A query shaped like an article number: one unbroken token with at least one
 * digit. Used only to decide whether the exact-SKU lookup is worth a round trip
 * — never to reject a query, so a false negative costs nothing but the usual
 * full-text path.
 */
const SKU_SHAPED = /^[\p{L}\p{N}][\p{L}\p{N}._/-]{2,63}$/u;

function looksLikeSku(query: string): boolean {
  return SKU_SHAPED.test(query) && /\d/.test(query);
}

/** Postgres sort columns per {@link SearchSort} (the fallback has no relevance). */
const POSTGRES_SORT: Record<SearchSort, { sortBy: string; sortOrder: 'asc' | 'desc' }> = {
  relevance: { sortBy: 'createdAt', sortOrder: 'desc' },
  price_asc: { sortBy: 'price', sortOrder: 'asc' },
  price_desc: { sortBy: 'price', sortOrder: 'desc' },
  newest: { sortBy: 'createdAt', sortOrder: 'desc' },
};

/** Meilisearch `sort` expressions per {@link SearchSort}; `relevance` sends none. */
const MEILI_SORT: Record<SearchSort, string[] | undefined> = {
  relevance: undefined,
  price_asc: ['price:asc'],
  price_desc: ['price:desc'],
  newest: ['createdAt:desc'],
};

/** One page of search results — the same `Paginated` shape as the product list. */
export type SearchResultsPage = Paginated<PublicProductEntity>;

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
  /** The full reindex currently running, if any — see {@link reindexAll}. */
  private reindexInFlight: Promise<number> | null = null;

  constructor(
    private readonly meili: MeiliClient,
    private readonly productRepository: ProductRepository,
    private readonly categoryRepository: CategoryRepository,
    private readonly logger: PinoLogger,
    private readonly catalogueFilters: CatalogueFilterResolver,
    // The admin-edited synonym list (TASK-559). Optional only so the unit specs
    // that build this service by hand keep working; the module always provides
    // it. Absent → the built-in dictionary.
    @Optional() private readonly synonyms?: SearchSynonymsService,
  ) {
    this.logger.setContext(SearchService.name);
  }

  /** The synonym map to index with: the saved list, or the built-in one. */
  private synonymMap(): Promise<SynonymMap> {
    return this.synonyms ? this.synonyms.getSynonymMap() : Promise.resolve(UA_EN_SYNONYMS);
  }

  /**
   * The controller's entry point: run a results-page query straight from its
   * validated DTO (TASK-420).
   *
   * The slug → id step lives here rather than in the controller because it IS
   * business logic — it decides what an unknown `?brand=` means (an empty page,
   * not a 400) — and because `/search` and the catalogue must answer that
   * question identically. {@link search} itself keeps taking ids, so every
   * internal caller and every existing test is unaffected.
   */
  async searchFromQuery(query: SearchQueryDto): Promise<SearchResultsPage> {
    const filters = await this.catalogueFilters.resolve(query);
    return this.search(query.q ?? '', query.page ?? 1, query.limit ?? DEFAULT_SEARCH_LIMIT, {
      categoryId: filters.categoryId,
      brandId: filters.brandId,
      deviceModelId: filters.deviceModelId,
      inStock: query.inStock,
      minPrice: query.minPrice,
      maxPrice: query.maxPrice,
      sort: query.sort,
    });
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

  /**
   * Apply the index settings (idempotent, best-effort), with the synonym map
   * read from the admin's saved list (TASK-559) rather than the built-in one
   * the constant carries.
   */
  async ensureIndex(): Promise<void> {
    await this.meili.ensureIndex({
      ...PRODUCTS_INDEX_SETTINGS,
      synonyms: await this.synonymMap(),
    });
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
    await this.meili.indexDocuments([await this.toDocument(source, await this.synonymMap())]);
  }

  /** Remove a product from the index (deactivate / delete). */
  async removeProduct(productId: string): Promise<void> {
    if (!this.meili.isConfigured()) return;
    await this.meili.deleteDocument(productId);
  }

  /**
   * Full reindex: upsert every active product, then drop whatever is left in the
   * index that the database no longer knows about. Used on bootstrap and by the
   * admin reindex endpoint for drift recovery. Returns the number of documents
   * Meilisearch CONFIRMED it applied.
   *
   * Deliberately no `clearDocuments()` first (TASK-376). Clearing and refilling
   * are two independent best-effort calls, so a failure between them — a
   * restart, a slow engine, a database hiccup — left the index empty until the
   * next successful reindex. That turned a routine `restart store-api` into a
   * way to BREAK a working search, which is the opposite of what a repair
   * operation should be able to do. Upsert-then-prune never empties the index:
   * a failure part-way through leaves the previous documents in place.
   *
   * Single-flight (TASK-522): a call made while a pass is running joins that
   * pass instead of starting a second one. The boot reindex, the admin button
   * and `npm run search:reindex` (which boots its own copy of the app, and with
   * it a boot reindex) all meet here; two concurrent passes doubled the engine
   * work and raced their prunes.
   */
  reindexAll(): Promise<number> {
    if (!this.reindexInFlight) {
      this.reindexInFlight = this.runReindex().finally(() => {
        this.reindexInFlight = null;
      });
    }
    return this.reindexInFlight;
  }

  private async runReindex(): Promise<number> {
    if (!this.meili.isConfigured()) return 0;
    await this.ensureIndex();

    // One synonym map for the whole pass, so every document of it agrees.
    const synonyms = await this.synonymMap();
    const seenIds = new Set<string>();
    const batches: { uid: number; count: number }[] = [];
    let skip = 0;
    for (;;) {
      const { items } = await this.productRepository.findManyForIndex(skip, REINDEX_BATCH);
      if (items.length === 0) break;
      const docs = await Promise.all(items.map((item) => this.toDocument(item, synonyms)));
      for (const doc of docs) seenIds.add(doc.id);
      const uid = await this.meili.indexDocuments(docs);
      if (uid !== null) batches.push({ uid, count: docs.length });
      if (items.length < REINDEX_BATCH) break;
      skip += REINDEX_BATCH;
    }

    // Count only what the engine actually accepted. An enqueued write that later
    // fails used to be reported as a success, so the log said "reindex complete"
    // over an empty index.
    const { failedUids } = await this.meili.waitForTasks(batches.map((b) => b.uid));
    const failed = new Set(failedUids);
    const indexed = batches.filter((b) => !failed.has(b.uid)).reduce((sum, b) => sum + b.count, 0);

    const pruned = await this.pruneStaleDocuments(seenIds);
    this.logger.info(
      { indexed, pruned, failedBatches: failedUids.length },
      'Meilisearch reindex complete',
    );
    return indexed;
  }

  /**
   * Delete documents that survive in the index but no longer exist as active
   * products. Returns how many were removed.
   *
   * Two guards, both of which exist so a bad read can never empty the index:
   * `listDocumentIds()` returning `null` means "could not check" (not "index is
   * empty"), and an empty `seenIds` means the database returned no indexable
   * products at all — plausible on a brand-new install, but far more often a
   * symptom, and deleting the entire index on that basis is not a repair.
   */
  private async pruneStaleDocuments(seenIds: Set<string>): Promise<number> {
    const indexedIds = await this.meili.listDocumentIds();
    if (indexedIds === null) return 0;
    if (seenIds.size === 0) {
      if (indexedIds.size > 0) {
        this.logger.warn(
          { indexedDocuments: indexedIds.size },
          'Reindex found no indexable products; keeping existing documents rather than emptying the index',
        );
      }
      return 0;
    }
    const stale = [...indexedIds].filter((id) => !seenIds.has(id));
    if (stale.length === 0) return 0;
    const uid = await this.meili.deleteDocuments(stale);
    if (uid !== null) await this.meili.waitForTasks([uid]);
    return stale.length;
  }

  /**
   * Paginated product search. Meilisearch returns ranked, typo-tolerant matches
   * as ids which are hydrated into full product cards; on any miss it falls back
   * to the Postgres `contains` scan.
   */
  async search(
    rawQuery: string,
    page = 1,
    limit = DEFAULT_SEARCH_LIMIT,
    filters: SearchFilters = {},
  ): Promise<SearchResultsPage> {
    const query = (rawQuery ?? '').trim();
    const pageNum = page > 0 ? page : 1;
    const pageSize = limit > 0 ? limit : DEFAULT_SEARCH_LIMIT;

    const exact = await this.findByExactSku(query, pageNum, pageSize, filters);
    if (exact) return exact;

    if (this.meili.isConfigured()) {
      // page/hitsPerPage, not limit/offset (TASK-537): the results page draws a
      // clickable list of numbered pages from `meta.totalPages`, and only this
      // mode makes the engine count exactly. The old `estimatedTotalHits` could
      // overshoot into a page with no hits — which then fell through to Postgres
      // and showed a different set, with a different total, under that URL.
      const result = await this.meili.search(query, {
        page: pageNum,
        hitsPerPage: pageSize,
        filter: this.buildMeiliFilter(filters),
        sort: MEILI_SORT[filters.sort ?? 'relevance'],
      });
      // A page-mode answer always carries `totalHits`; should one ever lack it,
      // count only what is provably there (never an estimate that overshoots).
      const totalHits =
        result?.totalHits ??
        (result && result.hits.length > 0 ? (pageNum - 1) * pageSize + result.hits.length : 0);
      // An EMPTY hit list with NO matches at all falls through to Postgres,
      // exactly like an error (TASK-376). Zero hits is a perfectly valid
      // Meilisearch response, so the old `if (result)` trusted a stale or
      // still-empty index and answered "nothing found" over a full catalogue —
      // the state a freshly seeded server is in, since seeding writes straight to
      // Postgres. The cost is one extra query in the rare case where there
      // genuinely is no match.
      //
      // Matches but no hits on THIS page is different: the engine has answered,
      // the page is past the end (a stale bookmark, a hand-edited URL, or a page
      // beyond `maxTotalHits`). Say so with the engine's own total instead of
      // swapping in Postgres' result set under the same URL.
      if (result && result.hits.length === 0 && totalHits > 0) {
        return { items: [], meta: this.buildMeta(totalHits, pageNum, pageSize) };
      }
      if (result && result.hits.length > 0) {
        const ids = result.hits.map((hit) => hit.id);
        const products = await this.productRepository.findByIdsForCards(ids);
        const byId = new Map(products.map((p) => [p.id, p]));
        // Preserve Meilisearch's relevance ordering.
        const items = ids
          .map((id) => byId.get(id))
          .filter((p): p is NonNullable<typeof p> => p != null)
          .map((p) => PublicProductEntity.fromPrisma(p));
        // Nothing survived the visibility-gated re-read (TASK-297 drops products
        // whose category was withdrawn). Answering "nothing found" over a live
        // catalogue would be a lie told by a stale index, so let Postgres have
        // the query — the same rule the blog path applies.
        if (items.length > 0) {
          return { items, meta: this.buildMeta(totalHits, pageNum, pageSize) };
        }
      }
    }

    return this.postgresSearch(query, pageNum, pageSize, filters);
  }

  /**
   * Exact article-number lookup (SF-SRCH-09). An SKU is a CODE, not a phrase:
   * «RN13PRO-BK» has no business being typo-corrected, stemmed or ranked, and
   * the shopper who typed it wants the one position it names — which is why this
   * runs BEFORE the full-text path rather than as a fallback behind it.
   *
   * Deliberately narrow:
   *  - only for a query shaped like a code, so an ordinary phrase costs no extra
   *    round trip;
   *  - only on page 1 with NO facet applied — an SKU already identifies a single
   *    product, so paging or narrowing it further is meaningless and would make
   *    a filtered result set contradict its own filters;
   *  - case-insensitive (TASK-542): `ip15-1` finds `IP15-1`, exactly as the
   *    Postgres fallback's `contains` would, so the answer no longer depends on
   *    whether the engine is up;
   *  - the hit is re-read through `findByIdsForCards`, which gates on
   *    `isActive` + an active category, so a withdrawn product never surfaces
   *    through its code.
   *
   * Kept after TASK-522 put `sku` into the index, on purpose. The engine answers
   * a PARTIAL code («RN13» → «RN13PRO-BK») and a code inside a phrase, which it
   * could not before — but it cannot answer a whole code with exactly one
   * position: the hyphen splits `IP15-1` into two words and the last word is
   * matched as a prefix, so the engine returns `IP15-1` together with `IP15-10`,
   * `IP15-12`… SF-SRCH-09 («знаходить рівно цей товар») needs the single hit,
   * and only this lookup gives it.
   */
  private async findByExactSku(
    query: string,
    page: number,
    limit: number,
    filters: SearchFilters,
  ): Promise<SearchResultsPage | null> {
    if (page !== 1 || !looksLikeSku(query) || hasFacets(filters)) return null;

    const match = await this.productRepository.findBySkuIgnoringCase(query);
    if (!match) return null;

    const [card] = await this.productRepository.findByIdsForCards([match.id]);
    if (!card) return null;

    return {
      items: [PublicProductEntity.fromPrisma(card)],
      meta: { total: 1, page: 1, limit, totalPages: 1 },
    };
  }

  /**
   * Translate the requested facets into a Meilisearch filter expression. The
   * category rolls UP (`categoryIds` holds the product's own category plus every
   * ancestor, TASK-236), so filtering by a parent matches its subcategories
   * without expanding anything here.
   */
  private buildMeiliFilter(filters: SearchFilters): string[] {
    const expressions = ['isActive = true'];
    if (filters.categoryId) expressions.push(`categoryIds = "${filters.categoryId}"`);
    if (filters.brandId) expressions.push(`brandId = "${filters.brandId}"`);
    if (filters.deviceModelId) expressions.push(`deviceModelIds = "${filters.deviceModelId}"`);
    if (filters.inStock === true) expressions.push('inStock = true');
    if (filters.minPrice != null) expressions.push(`price >= ${filters.minPrice}`);
    if (filters.maxPrice != null) expressions.push(`price <= ${filters.maxPrice}`);
    return expressions;
  }

  /**
   * Lightweight autocomplete suggestions. Meilisearch ranks the hits, then their
   * ids are re-hydrated through the active-category-gated card read (so a stale
   * index row for a withdrawn category's product never reaches the dropdown,
   * TASK-297); with no engine it falls back to a small Postgres `contains` scan.
   * Returns `[]` for a blank query.
   */
  async suggest(rawQuery: string): Promise<SearchSuggestionEntity[]> {
    const query = (rawQuery ?? '').trim();
    if (query.length === 0) return [];

    if (this.meili.isConfigured()) {
      const result = await this.meili.search(query, {
        limit: SUGGEST_LIMIT,
        filter: ['isActive = true'],
      });
      // Empty → fall through to the Postgres scan below, same as an error
      // (TASK-376): an empty index must not silently mute autocomplete.
      if (result && result.hits.length > 0) {
        // Re-hydrate the hit ids through the SAME active-category-gated read the
        // results page uses (findByIdsForCards filters category:{isActive:true}),
        // instead of trusting the raw index rows. De-indexing on category
        // withdrawal is best-effort and fire-and-forget (afterStatusChange →
        // reindexSubtreesInBackground swallows errors), so a document for a
        // withdrawn category's product can linger — e.g. Meilisearch was
        // unreachable at the moment the category was pulled — until a manual
        // reindexAll. This backstop drops such a stale hit from the dropdown
        // rather than surfacing a dead PDP link (TASK-297), and preserves
        // Meilisearch's relevance ordering exactly like `search`.
        const ids = result.hits.map((hit) => hit.id);
        const products = await this.productRepository.findByIdsForCards(ids);
        const byId = new Map(products.map((p) => [p.id, p]));
        return ids
          .map((id) => byId.get(id))
          .filter((p): p is NonNullable<typeof p> => p != null)
          .map((p) => ({
            id: p.id,
            name: p.name,
            slug: p.slug,
            price: p.price.toString(),
            compareAtPrice: p.compareAtPrice ? p.compareAtPrice.toString() : null,
            primaryImageUrl: p.primaryImage?.url ?? null,
          }));
      }
    }

    const { products } = await this.productRepository.findAll({
      page: 1,
      limit: SUGGEST_LIMIT,
      isActive: true,
      // The Postgres fallback must apply the same on-sale rule the index does —
      // a withdrawn category's products are absent from Meilisearch, so they must
      // be absent here too, or search silently resurrects them (TASK-297).
      categoryActiveOnly: true,
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

  /**
   * Postgres `contains` fallback for the results page. Applies the SAME facets
   * as the engine path (TASK-417) — a filtered search that quietly widened when
   * Meilisearch went down would be worse than an outright error, because nothing
   * on screen would say the filter had stopped applying.
   */
  private async postgresSearch(
    query: string,
    page: number,
    limit: number,
    filters: SearchFilters = {},
  ): Promise<SearchResultsPage> {
    // The subtree rollup lives in the service, not the repository (TASK-236):
    // `findAll` takes an already-expanded id set.
    const categoryIds = filters.categoryId
      ? await this.categoryRepository.findSubtreeIds(filters.categoryId)
      : undefined;
    const { sortBy, sortOrder } = POSTGRES_SORT[filters.sort ?? 'relevance'];

    const { products, total } = await this.productRepository.findAll({
      page,
      limit,
      isActive: true,
      // Same on-sale rule as the index (TASK-297) — see `suggest`.
      categoryActiveOnly: true,
      search: query || undefined,
      categoryIds,
      brandId: filters.brandId,
      deviceModelId: filters.deviceModelId,
      inStock: filters.inStock === true ? true : undefined,
      minPrice: filters.minPrice,
      maxPrice: filters.maxPrice,
      sortBy,
      sortOrder,
    });
    return {
      items: products.map((p) => PublicProductEntity.fromPrisma(p)),
      meta: this.buildMeta(total, page, limit),
    };
  }

  /**
   * Build a Meilisearch document from an index source (Decimal → number).
   * `categoryIds` is expanded to the product's category plus every ancestor id
   * (TASK-236) so a category-scoped filter rolls up subcategory products, just
   * like the Postgres subtree rollup.
   */
  private async toDocument(
    source: ProductIndexSource,
    synonyms: SynonymMap,
  ): Promise<ProductSearchDocument> {
    const categoryIds = await this.categoryRepository.findAncestorIds(source.categoryId);
    return {
      id: source.id,
      name: source.name,
      description: source.description,
      slug: source.slug,
      sku: source.sku,
      keywords: source.keywords,
      price: Number(source.price.toString()),
      compareAtPrice:
        source.compareAtPrice != null ? Number(source.compareAtPrice.toString()) : null,
      categoryIds,
      deviceModelIds: source.deviceModelIds,
      categoryName: source.categoryName,
      brandId: source.brandId,
      brandName: source.brandName,
      primaryImageUrl: source.primaryImageUrl,
      blurDataUrl: source.blurDataUrl,
      inStock: source.stock > 0,
      isActive: source.isActive,
      createdAt: source.createdAt.getTime(),
      // The code feeds the cross-script terms too (TASK-522): a code that spells
      // out what the product fits («GLASS-IPHONE-15») must be findable in the
      // other script («айфон») even when the name does not say it. The admin tags
      // likewise (TASK-558): a "MagSafe" tag must answer «магсейф».
      searchTerms: extractSearchSynonymTerms(
        `${source.name} ${source.categoryName} ${source.brandName ?? ''} ${source.sku ?? ''} ${source.keywords.join(' ')}`,
        synonyms,
      ),
    };
  }

  private buildMeta(total: number, page: number, limit: number): PaginationMeta {
    return { total, page, limit, totalPages: Math.ceil(total / limit) };
  }
}
