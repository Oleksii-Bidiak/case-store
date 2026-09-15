import { PinoLogger } from 'nestjs-pino';
import { ProductRepository } from '../product/product.repository';
import { CategoryRepository } from '../category';
import { BrandRepository } from '../brand';
import { DeviceRepository } from '../device';
import {
  CatalogueFilterResolver,
  UNRESOLVED_FILTER_ID,
} from '../catalog-filter/catalogue-filter.resolver';
import { PublicProductEntity } from '../product/entities';
import { MeiliClient } from './meili.client';
import {
  SearchService,
  PRODUCTS_INDEX_SETTINGS,
  SUGGEST_LIMIT,
  DEFAULT_SEARCH_LIMIT,
} from './search.service';

// ─── Fixtures ────────────────────────────────────────────────────────────────

const loggerMock = {
  setContext: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
} as unknown as PinoLogger;

function makeProduct(overrides: Record<string, unknown> = {}) {
  return {
    id: 'product-1',
    name: 'iPhone 15 Case',
    slug: 'iphone-15-case',
    description: 'Clear case',
    price: { toString: () => '29.99' },
    compareAtPrice: null,
    sku: 'IP-1',
    stock: 10,
    categoryId: 'cat-1',
    groupId: null,
    attributes: {},
    positionOrder: 0,
    isActive: true,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    ratingAverage: null,
    ratingCount: 0,
    primaryImage: {
      id: 'img-1',
      url: 'http://img/1.jpg',
      alt: null,
      blurDataUrl: null,
      sortOrder: 0,
      isPrimary: true,
    },
    variantSiblings: undefined,
    ...overrides,
  };
}

function makeIndexSource(overrides: Record<string, unknown> = {}) {
  return {
    id: 'product-1',
    name: 'iPhone 15 Case',
    description: 'Clear case',
    price: { toString: () => '29.99' },
    compareAtPrice: { toString: () => '39.99' },
    slug: 'iphone-15-case',
    categoryId: 'cat-1',
    categoryName: 'Cases',
    brandId: 'brand-1',
    brandName: 'Spigen',
    primaryImageUrl: 'http://img/1.jpg',
    blurDataUrl: 'data:blur',
    stock: 10,
    isActive: true,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    deviceModelIds: [],
    ...overrides,
  };
}

describe('SearchService', () => {
  let service: SearchService;
  let meili: jest.Mocked<
    Pick<
      MeiliClient,
      | 'isConfigured'
      | 'ensureIndex'
      | 'indexDocuments'
      | 'deleteDocument'
      | 'deleteDocuments'
      | 'clearDocuments'
      | 'listDocumentIds'
      | 'waitForTasks'
      | 'search'
    >
  >;
  let repo: jest.Mocked<
    Pick<
      ProductRepository,
      'findAll' | 'findByIdsForCards' | 'findOneForIndex' | 'findManyForIndex' | 'findBySku'
    >
  >;
  let categoryRepo: jest.Mocked<Pick<CategoryRepository, 'findAncestorIds' | 'findSubtreeIds'>> & {
    findBySlug?: jest.Mock;
    findById?: jest.Mock;
  };
  // TASK-420 — the two repositories the slug → id resolver adds.
  let brandRepo: { findBySlug: jest.Mock; findById: jest.Mock };
  let deviceRepo: { findModelBySlug: jest.Mock; findModelById: jest.Mock };

  beforeEach(() => {
    jest.clearAllMocks();
    meili = {
      isConfigured: jest.fn().mockReturnValue(true),
      ensureIndex: jest.fn().mockResolvedValue(undefined),
      // Resolves to the ENQUEUED task uid (TASK-376) — reindexAll waits on these
      // before it reports how much it indexed.
      indexDocuments: jest.fn().mockResolvedValue(10),
      deleteDocument: jest.fn().mockResolvedValue(undefined),
      deleteDocuments: jest.fn().mockResolvedValue(11),
      clearDocuments: jest.fn().mockResolvedValue(undefined),
      listDocumentIds: jest.fn().mockResolvedValue(new Set<string>()),
      waitForTasks: jest.fn().mockResolvedValue({ failedUids: [] }),
      search: jest.fn(),
    };
    repo = {
      findAll: jest.fn(),
      findByIdsForCards: jest.fn(),
      findOneForIndex: jest.fn(),
      findManyForIndex: jest.fn(),
      // TASK-417: the exact-article-number lookup. Answers "no such code" by
      // default so every other test keeps taking the full-text path.
      findBySku: jest.fn().mockResolvedValue(null),
    };
    // TASK-236: by default a category's ancestor chain is just itself; the
    // toDocument tests override it to prove the rollup expansion. `findSubtreeIds`
    // is the mirror image used by the Postgres fallback's category facet.
    categoryRepo = {
      findAncestorIds: jest.fn((id: string) => Promise.resolve([id])),
      findSubtreeIds: jest.fn((id: string) => Promise.resolve([id])),
    };
    // TASK-420: `/search` narrows by the same slug-shaped axes as the catalogue.
    // The REAL resolver over stub repositories, so `searchFromQuery` is tested
    // against the actual slug → id step rather than a mock of it.
    brandRepo = {
      findBySlug: jest.fn((slug: string) => Promise.resolve({ id: `id-of-${slug}`, slug })),
      findById: jest.fn((id: string) => Promise.resolve({ id, slug: `slug-of-${id}` })),
    };
    deviceRepo = {
      findModelBySlug: jest.fn((slug: string) => Promise.resolve({ id: `id-of-${slug}`, slug })),
      findModelById: jest.fn((id: string) => Promise.resolve({ id, slug: `slug-of-${id}` })),
    };
    categoryRepo.findBySlug = jest.fn((slug: string) =>
      Promise.resolve({ id: `id-of-${slug}`, slug }),
    );
    categoryRepo.findById = jest.fn((id: string) => Promise.resolve({ id, slug: `slug-of-${id}` }));

    service = new SearchService(
      meili as unknown as MeiliClient,
      repo as unknown as ProductRepository,
      categoryRepo as unknown as CategoryRepository,
      loggerMock,
      new CatalogueFilterResolver(
        categoryRepo as unknown as CategoryRepository,
        brandRepo as unknown as BrandRepository,
        deviceRepo as unknown as DeviceRepository,
      ),
    );
  });

  // ─── ensureIndex ─────────────────────────────────────────────────────────────

  describe('ensureIndex', () => {
    it('applies the product index settings', async () => {
      await service.ensureIndex();
      expect(meili.ensureIndex).toHaveBeenCalledWith(PRODUCTS_INDEX_SETTINGS);
    });

    it('configures searchable/filterable/sortable attributes + typo tolerance', () => {
      expect(PRODUCTS_INDEX_SETTINGS.searchableAttributes).toEqual([
        'name',
        'description',
        'categoryName',
        'brandName',
        'searchTerms',
      ]);
      // `price` + `inStock` are facets since TASK-417: the results page renders
      // the catalogue filter panel, and those two have to narrow the ENGINE's
      // answer, not the hydrated page.
      expect(PRODUCTS_INDEX_SETTINGS.filterableAttributes).toEqual([
        'isActive',
        'categoryIds',
        'brandId',
        'deviceModelIds',
        'price',
        'inStock',
      ]);
      expect(PRODUCTS_INDEX_SETTINGS.sortableAttributes).toEqual(['price', 'createdAt']);
      expect(PRODUCTS_INDEX_SETTINGS.typoTolerance).toBeDefined();
    });

    it('ships the bidirectional UA↔EN synonym map (TASK-200)', () => {
      expect(PRODUCTS_INDEX_SETTINGS.synonyms?.['айфон']).toContain('iphone');
      expect(PRODUCTS_INDEX_SETTINGS.synonyms?.['iphone']).toContain('айфон');
      expect(PRODUCTS_INDEX_SETTINGS.synonyms?.['чохол']).toContain('case');
    });
  });

  // ─── indexProduct / removeProduct ────────────────────────────────────────────

  describe('indexProduct', () => {
    it('upserts a document built from the index source', async () => {
      repo.findOneForIndex.mockResolvedValue(makeIndexSource() as never);

      await service.indexProduct('product-1');

      expect(meili.indexDocuments).toHaveBeenCalledTimes(1);
      const [docs] = meili.indexDocuments.mock.calls[0];
      expect(docs[0]).toEqual(
        expect.objectContaining({
          id: 'product-1',
          name: 'iPhone 15 Case',
          slug: 'iphone-15-case',
          price: 29.99,
          compareAtPrice: 39.99,
          categoryName: 'Cases',
          brandId: 'brand-1',
          brandName: 'Spigen',
          inStock: true,
          isActive: true,
          createdAt: new Date('2026-01-01T00:00:00.000Z').getTime(),
        }),
      );
    });

    it('expands categoryIds to the category + its ancestors (TASK-236 rollup)', async () => {
      repo.findOneForIndex.mockResolvedValue(makeIndexSource({ categoryId: 'leaf-cat' }) as never);
      categoryRepo.findAncestorIds.mockResolvedValue(['leaf-cat', 'mid-cat', 'root-cat']);

      await service.indexProduct('product-1');

      expect(categoryRepo.findAncestorIds).toHaveBeenCalledWith('leaf-cat');
      const [docs] = meili.indexDocuments.mock.calls[0];
      expect(docs[0].categoryIds).toEqual(['leaf-cat', 'mid-cat', 'root-cat']);
      // Old scalar field is gone.
      expect(docs[0]).not.toHaveProperty('categoryId');
    });

    it('populates deviceModelIds from the compat join (TASK-190)', async () => {
      repo.findOneForIndex.mockResolvedValue(
        makeIndexSource({ deviceModelIds: ['dm-1', 'dm-2'] }) as never,
      );

      await service.indexProduct('product-1');

      const [docs] = meili.indexDocuments.mock.calls[0];
      expect(docs[0].deviceModelIds).toEqual(['dm-1', 'dm-2']);
    });

    it('injects cross-script search terms derived from name + category + brand (TASK-200/367)', async () => {
      repo.findOneForIndex.mockResolvedValue(makeIndexSource() as never);

      await service.indexProduct('product-1');

      const [docs] = meili.indexDocuments.mock.calls[0];
      // "iPhone 15 Case" + "Cases" + brand → айфон + чохол/чохли + спіген, so a
      // typo'd UA query («афйон») matches via ordinary typo tolerance.
      //
      // `toContain`, not `toEqual`: the dictionary is meant to grow, and asserting
      // the exact list makes every new synonym group a failing test in a file that
      // is not about the dictionary. `search-synonyms.spec.ts` owns its contents.
      for (const term of ['айфон', 'чохол', 'чохли']) {
        expect(docs[0].searchTerms).toContain(term);
      }
    });

    // A null source means "not on sale" — missing, soft-deleted, deactivated, or
    // (TASK-297) filed in a DEACTIVATED CATEGORY. This delete is therefore the ONLY
    // de-indexing path a category withdrawal needs: `afterStatusChange` pushes the
    // subtree's products back through `indexProduct`, each resolves to null here, and
    // its document is evicted. Re-activating the category re-indexes them the same way.
    it('removes the product when it is not indexable (source is null)', async () => {
      repo.findOneForIndex.mockResolvedValue(null);

      await service.indexProduct('gone');

      expect(meili.deleteDocument).toHaveBeenCalledWith('gone');
      expect(meili.indexDocuments).not.toHaveBeenCalled();
    });

    it('is a no-op when the engine is not configured', async () => {
      meili.isConfigured.mockReturnValue(false);

      await service.indexProduct('product-1');

      expect(repo.findOneForIndex).not.toHaveBeenCalled();
      expect(meili.indexDocuments).not.toHaveBeenCalled();
    });
  });

  describe('removeProduct', () => {
    it('deletes the document by id', async () => {
      await service.removeProduct('product-1');
      expect(meili.deleteDocument).toHaveBeenCalledWith('product-1');
    });

    it('is a no-op when the engine is not configured', async () => {
      meili.isConfigured.mockReturnValue(false);
      await service.removeProduct('product-1');
      expect(meili.deleteDocument).not.toHaveBeenCalled();
    });
  });

  // ─── reindexAll ──────────────────────────────────────────────────────────────

  describe('reindexAll', () => {
    it('batch-upserts active products WITHOUT emptying the index first (TASK-376)', async () => {
      repo.findManyForIndex
        .mockResolvedValueOnce({ items: [makeIndexSource()] as never })
        .mockResolvedValueOnce({ items: [] });

      const count = await service.reindexAll();

      // The old implementation cleared first, so any failure after that point
      // left an empty index — i.e. a restart could break a working search.
      expect(meili.clearDocuments).not.toHaveBeenCalled();
      expect(meili.indexDocuments).toHaveBeenCalledTimes(1);
      expect(count).toBe(1);
    });

    it('prunes only the documents the database no longer has', async () => {
      repo.findManyForIndex
        .mockResolvedValueOnce({ items: [makeIndexSource({ id: 'product-1' })] as never })
        .mockResolvedValueOnce({ items: [] });
      meili.listDocumentIds.mockResolvedValue(new Set(['product-1', 'gone-1', 'gone-2']));

      await service.reindexAll();

      expect(meili.deleteDocuments).toHaveBeenCalledTimes(1);
      const [staleIds] = meili.deleteDocuments.mock.calls[0];
      expect([...staleIds].sort()).toEqual(['gone-1', 'gone-2']);
    });

    it('keeps existing documents when the database returns nothing indexable', async () => {
      // An empty product read is far more often a symptom than a genuinely empty
      // catalogue — wiping the index on that basis is not a repair.
      repo.findManyForIndex.mockResolvedValue({ items: [] } as never);
      meili.listDocumentIds.mockResolvedValue(new Set(['product-1']));

      const count = await service.reindexAll();

      expect(meili.deleteDocuments).not.toHaveBeenCalled();
      expect(count).toBe(0);
    });

    it('skips the prune when the index listing is unavailable', async () => {
      repo.findManyForIndex
        .mockResolvedValueOnce({ items: [makeIndexSource()] as never })
        .mockResolvedValueOnce({ items: [] });
      // null = "could not check", which must never be read as "index is empty".
      meili.listDocumentIds.mockResolvedValue(null);

      await service.reindexAll();

      expect(meili.deleteDocuments).not.toHaveBeenCalled();
    });

    it('counts only the batches Meilisearch confirmed it applied', async () => {
      repo.findManyForIndex
        .mockResolvedValueOnce({ items: [makeIndexSource()] as never })
        .mockResolvedValueOnce({ items: [] });
      meili.indexDocuments.mockResolvedValue(42);
      meili.waitForTasks.mockResolvedValue({ failedUids: [42] });

      const count = await service.reindexAll();

      // Enqueued ≠ applied: the old code reported success for a rejected write.
      expect(count).toBe(0);
    });

    it('returns 0 without touching Meili when unconfigured', async () => {
      meili.isConfigured.mockReturnValue(false);
      const count = await service.reindexAll();
      expect(count).toBe(0);
      expect(meili.indexDocuments).not.toHaveBeenCalled();
    });
  });

  // ─── search (Meili path + fallback) ──────────────────────────────────────────

  describe('search', () => {
    it('hydrates Meili hit ids into product cards, preserving order', async () => {
      meili.search.mockResolvedValue({
        hits: [{ id: 'product-2' }, { id: 'product-1' }] as never,
        estimatedTotalHits: 2,
      });
      repo.findByIdsForCards.mockResolvedValue([
        makeProduct({ id: 'product-1' }),
        makeProduct({ id: 'product-2', name: 'Screen Protector' }),
      ] as never);

      const result = await service.search('case', 1, 20);

      expect(meili.search).toHaveBeenCalledWith('case', {
        limit: 20,
        offset: 0,
        filter: ['isActive = true'],
      });
      // Order follows Meili relevance (product-2 first), not the repo order.
      expect(result.data.map((p) => p.id)).toEqual(['product-2', 'product-1']);
      expect(result.data[0]).toBeInstanceOf(PublicProductEntity);
      expect(result.meta).toEqual({ total: 2, page: 1, limit: 20, totalPages: 1 });
    });

    it('falls back to Postgres when Meili returns null (engine down)', async () => {
      meili.search.mockResolvedValue(null);
      repo.findAll.mockResolvedValue({ products: [makeProduct()], total: 1 } as never);

      const result = await service.search('case', 1, 20);

      // `categoryActiveOnly` is what keeps the fallback honest (TASK-297): the Meili
      // index has no documents for a withdrawn category's products, so the Postgres
      // path must not resurrect them the moment the engine goes down.
      expect(repo.findAll).toHaveBeenCalledWith(
        expect.objectContaining({
          search: 'case',
          isActive: true,
          categoryActiveOnly: true,
          page: 1,
          limit: 20,
        }),
      );
      expect(result.data).toHaveLength(1);
      expect(result.data[0]).toBeInstanceOf(PublicProductEntity);
    });

    it('falls back to Postgres when the index answers with zero hits (TASK-376)', async () => {
      // The state a freshly deployed server is in: the engine is up and healthy,
      // the index is empty because seeding wrote straight to Postgres. Trusting
      // that answer showed "nothing found" over a full catalogue.
      meili.search.mockResolvedValue({ hits: [], estimatedTotalHits: 0 });
      repo.findAll.mockResolvedValue({ products: [makeProduct()], total: 1 } as never);

      const result = await service.search('case', 1, 20);

      expect(repo.findAll).toHaveBeenCalledWith(
        expect.objectContaining({ search: 'case', isActive: true, categoryActiveOnly: true }),
      );
      expect(result.data).toHaveLength(1);
      expect(result.meta.total).toBe(1);
    });

    it('uses Postgres directly when the engine is unconfigured', async () => {
      meili.isConfigured.mockReturnValue(false);
      repo.findAll.mockResolvedValue({ products: [], total: 0 } as never);

      const result = await service.search('case');

      expect(meili.search).not.toHaveBeenCalled();
      expect(repo.findAll).toHaveBeenCalled();
      expect(result.meta.limit).toBe(DEFAULT_SEARCH_LIMIT);
    });

    it('falls back to Postgres when every hit is dropped by the visibility re-read', async () => {
      // Drift the TASK-297 backstop exists for: the index still holds documents
      // for a withdrawn category's products, so `findByIdsForCards` returns
      // none of them. Reporting that as "nothing found" — over a live catalogue
      // and with a non-zero `total` — is the stale index talking, not the data.
      meili.search.mockResolvedValue({
        hits: [{ id: 'gone-1' }, { id: 'gone-2' }] as never,
        estimatedTotalHits: 2,
      });
      repo.findByIdsForCards.mockResolvedValue([] as never);
      repo.findAll.mockResolvedValue({ products: [makeProduct()], total: 1 } as never);

      const result = await service.search('case', 1, 20);

      expect(repo.findAll).toHaveBeenCalledWith(
        expect.objectContaining({ search: 'case', isActive: true, categoryActiveOnly: true }),
      );
      expect(result.data).toHaveLength(1);
      expect(result.meta.total).toBe(1);
    });
  });

  // ─── search: facets + ordering (TASK-417) ───────────────────────────────────

  describe('search filters', () => {
    it('translates every facet into the engine filter expression', async () => {
      meili.search.mockResolvedValue({
        hits: [{ id: 'product-1' }] as never,
        estimatedTotalHits: 1,
      });
      repo.findByIdsForCards.mockResolvedValue([makeProduct()] as never);

      await service.search('case', 1, 20, {
        categoryId: 'cat-1',
        brandId: 'brand-1',
        deviceModelId: 'dm-1',
        inStock: true,
        minPrice: 10,
        maxPrice: 50,
      });

      expect(meili.search).toHaveBeenCalledWith(
        'case',
        expect.objectContaining({
          filter: [
            'isActive = true',
            'categoryIds = "cat-1"',
            'brandId = "brand-1"',
            'deviceModelIds = "dm-1"',
            'inStock = true',
            'price >= 10',
            'price <= 50',
          ],
        }),
      );
    });

    it('sends no sort for relevance and a price sort otherwise', async () => {
      meili.search.mockResolvedValue({
        hits: [{ id: 'product-1' }] as never,
        estimatedTotalHits: 1,
      });
      repo.findByIdsForCards.mockResolvedValue([makeProduct()] as never);

      await service.search('case', 1, 20, { sort: 'relevance' });
      expect(meili.search).toHaveBeenLastCalledWith(
        'case',
        expect.objectContaining({ sort: undefined }),
      );

      await service.search('case', 1, 20, { sort: 'price_asc' });
      expect(meili.search).toHaveBeenLastCalledWith(
        'case',
        expect.objectContaining({ sort: ['price:asc'] }),
      );

      await service.search('case', 1, 20, { sort: 'newest' });
      expect(meili.search).toHaveBeenLastCalledWith(
        'case',
        expect.objectContaining({ sort: ['createdAt:desc'] }),
      );
    });

    it('applies the SAME facets on the Postgres fallback, category subtree included', async () => {
      // A filtered search that quietly widened when the engine went down would be
      // worse than an error — nothing on screen would say the filter stopped
      // applying.
      meili.search.mockResolvedValue(null);
      categoryRepo.findSubtreeIds.mockResolvedValue(['cat-1', 'cat-1-a']);
      repo.findAll.mockResolvedValue({ products: [makeProduct()], total: 1 } as never);

      await service.search('case', 2, 12, {
        categoryId: 'cat-1',
        brandId: 'brand-1',
        deviceModelId: 'dm-1',
        inStock: true,
        minPrice: 10,
        maxPrice: 50,
        sort: 'price_desc',
      });

      expect(categoryRepo.findSubtreeIds).toHaveBeenCalledWith('cat-1');
      expect(repo.findAll).toHaveBeenCalledWith(
        expect.objectContaining({
          page: 2,
          limit: 12,
          search: 'case',
          isActive: true,
          categoryActiveOnly: true,
          categoryIds: ['cat-1', 'cat-1-a'],
          brandId: 'brand-1',
          deviceModelId: 'dm-1',
          inStock: true,
          minPrice: 10,
          maxPrice: 50,
          sortBy: 'price',
          sortOrder: 'desc',
        }),
      );
    });

    it('leaves the fallback unfiltered when no facet was requested', async () => {
      meili.search.mockResolvedValue(null);
      repo.findAll.mockResolvedValue({ products: [], total: 0 } as never);

      await service.search('case', 1, 20);

      expect(categoryRepo.findSubtreeIds).not.toHaveBeenCalled();
      expect(repo.findAll).toHaveBeenCalledWith(
        expect.objectContaining({
          categoryIds: undefined,
          brandId: undefined,
          inStock: undefined,
          sortBy: 'createdAt',
          sortOrder: 'desc',
        }),
      );
    });
  });

  // ─── searchFromQuery: slug facets (TASK-420) ────────────────────────────────
  // `/search` migrated together with the catalogue, so the results page speaks
  // one param language with the filter panel it shares. The resolution happens
  // in the service, not the controller, and the slug never reaches the
  // Meilisearch filter EXPRESSION — only the id read back out of the database.

  describe('searchFromQuery (slug facets)', () => {
    beforeEach(() => {
      meili.search.mockResolvedValue({
        hits: [{ id: 'product-1' }] as never,
        estimatedTotalHits: 1,
      });
      repo.findByIdsForCards.mockResolvedValue([makeProduct()] as never);
    });

    it('resolves slug facets to ids before building the engine filter', async () => {
      await service.searchFromQuery({
        q: 'case',
        category: 'phone-cases',
        brand: 'apple',
        device: 'iphone-15',
      });

      expect(meili.search).toHaveBeenCalledWith(
        'case',
        expect.objectContaining({
          filter: [
            'isActive = true',
            'categoryIds = "id-of-phone-cases"',
            'brandId = "id-of-apple"',
            'deviceModelIds = "id-of-iphone-15"',
          ],
        }),
      );
    });

    it('still accepts the legacy uuid spelling', async () => {
      await service.searchFromQuery({ q: 'case', brandId: 'brand-uuid-1' });

      expect(meili.search).toHaveBeenCalledWith(
        'case',
        expect.objectContaining({ filter: ['isActive = true', 'brandId = "brand-uuid-1"'] }),
      );
    });

    it('narrows to nothing — never widens — when a slug names nothing', async () => {
      brandRepo.findBySlug.mockResolvedValue(null);

      await service.searchFromQuery({ q: 'case', brand: 'no-such-brand' });

      expect(meili.search).toHaveBeenCalledWith(
        'case',
        expect.objectContaining({
          filter: ['isActive = true', `brandId = "${UNRESOLVED_FILTER_ID}"`],
        }),
      );
    });
  });

  // ─── search: exact article number (SF-SRCH-09) ──────────────────────────────

  describe('search by article number', () => {
    it('answers a code-shaped query with the single product it names', async () => {
      repo.findBySku.mockResolvedValue({ id: 'product-1' } as never);
      repo.findByIdsForCards.mockResolvedValue([makeProduct()] as never);

      const result = await service.search('RN13PRO-BK2', 1, 20);

      expect(repo.findBySku).toHaveBeenCalledWith('RN13PRO-BK2');
      // An SKU is a code, not a phrase — it must not be typo-corrected or ranked.
      expect(meili.search).not.toHaveBeenCalled();
      expect(result.data.map((p) => p.id)).toEqual(['product-1']);
      expect(result.meta).toEqual({ total: 1, page: 1, limit: 20, totalPages: 1 });
    });

    it('falls through to full text when the code matches nothing', async () => {
      repo.findBySku.mockResolvedValue(null);
      meili.search.mockResolvedValue({ hits: [], estimatedTotalHits: 0 });
      repo.findAll.mockResolvedValue({ products: [makeProduct()], total: 1 } as never);

      const result = await service.search('RN13PRO-BK2', 1, 20);

      expect(meili.search).toHaveBeenCalled();
      expect(result.data).toHaveLength(1);
    });

    it('drops the hit when the product is no longer card-visible (withdrawn category)', async () => {
      repo.findBySku.mockResolvedValue({ id: 'product-1' } as never);
      repo.findByIdsForCards.mockResolvedValue([] as never);
      meili.search.mockResolvedValue({ hits: [], estimatedTotalHits: 0 });
      repo.findAll.mockResolvedValue({ products: [], total: 0 } as never);

      const result = await service.search('RN13PRO-BK2', 1, 20);

      expect(result.data).toEqual([]);
      expect(repo.findAll).toHaveBeenCalled();
    });

    it('does not run for an ordinary phrase, a later page, or a filtered query', async () => {
      meili.search.mockResolvedValue({ hits: [], estimatedTotalHits: 0 });
      repo.findAll.mockResolvedValue({ products: [], total: 0 } as never);

      await service.search('case', 1, 20);
      await service.search('RN13PRO-BK2', 2, 20);
      await service.search('RN13PRO-BK2', 1, 20, { brandId: 'brand-1' });

      expect(repo.findBySku).not.toHaveBeenCalled();
    });
  });

  // ─── suggest ─────────────────────────────────────────────────────────────────

  describe('suggest', () => {
    it('re-hydrates Meili hit ids through the active-category-gated card read, preserving order', async () => {
      // suggest no longer trusts the raw index rows: it re-reads the hit ids via
      // findByIdsForCards (which filters category:{isActive:true}) so a stale doc
      // for a withdrawn category never reaches the dropdown (TASK-297).
      meili.search.mockResolvedValue({
        hits: [{ id: 'product-2' }, { id: 'product-1' }] as never,
        estimatedTotalHits: 2,
      });
      repo.findByIdsForCards.mockResolvedValue([
        makeProduct({ id: 'product-1', name: 'iPhone 15 Case', slug: 'iphone-15-case' }),
        makeProduct({
          id: 'product-2',
          name: 'Screen Protector',
          slug: 'screen-protector',
          compareAtPrice: { toString: () => '39.99' },
        }),
      ] as never);

      const res = await service.suggest('iphone');

      expect(meili.search).toHaveBeenCalledWith('iphone', {
        limit: SUGGEST_LIMIT,
        filter: ['isActive = true'],
      });
      expect(repo.findByIdsForCards).toHaveBeenCalledWith(['product-2', 'product-1']);
      // Order follows Meili relevance (product-2 first), not the repo order.
      expect(res.map((s) => s.id)).toEqual(['product-2', 'product-1']);
      expect(res[0]).toEqual({
        id: 'product-2',
        name: 'Screen Protector',
        slug: 'screen-protector',
        price: '29.99',
        compareAtPrice: '39.99',
        primaryImageUrl: 'http://img/1.jpg',
      });
    });

    it('drops a stale index hit whose product is no longer card-visible (withdrawn category, TASK-297)', async () => {
      // Meili still ranks a product whose category was pulled from sale (the
      // fire-and-forget de-index never landed); findByIdsForCards does not return
      // it, so it vanishes from the dropdown instead of surfacing a dead PDP link.
      meili.search.mockResolvedValue({
        hits: [{ id: 'live-product' }, { id: 'withdrawn-product' }] as never,
        estimatedTotalHits: 2,
      });
      repo.findByIdsForCards.mockResolvedValue([
        makeProduct({ id: 'live-product', slug: 'live' }),
      ] as never);

      const res = await service.suggest('case');

      expect(res.map((s) => s.id)).toEqual(['live-product']);
    });

    it('returns an empty array for a blank query without hitting the engine', async () => {
      const res = await service.suggest('   ');
      expect(res).toEqual([]);
      expect(meili.search).not.toHaveBeenCalled();
      expect(repo.findAll).not.toHaveBeenCalled();
    });

    it('falls back to Postgres when Meili is null', async () => {
      meili.search.mockResolvedValue(null);
      repo.findAll.mockResolvedValue({ products: [makeProduct()], total: 1 } as never);

      const res = await service.suggest('iphone');

      expect(repo.findAll).toHaveBeenCalledWith(
        expect.objectContaining({
          search: 'iphone',
          isActive: true,
          // Same on-sale rule as the results page (TASK-297).
          categoryActiveOnly: true,
          limit: SUGGEST_LIMIT,
        }),
      );
      expect(res[0]).toEqual(
        expect.objectContaining({ id: 'product-1', slug: 'iphone-15-case', price: '29.99' }),
      );
    });

    it('falls back to Postgres when the index answers with zero hits (TASK-376)', async () => {
      meili.search.mockResolvedValue({ hits: [], estimatedTotalHits: 0 });
      repo.findAll.mockResolvedValue({ products: [makeProduct()], total: 1 } as never);

      const res = await service.suggest('iphone');

      expect(repo.findAll).toHaveBeenCalled();
      expect(res.map((s) => s.id)).toEqual(['product-1']);
    });
  });
});
