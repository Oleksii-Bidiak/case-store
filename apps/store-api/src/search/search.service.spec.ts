import { PinoLogger } from 'nestjs-pino';
import { ProductRepository } from '../product/product.repository';
import { CategoryRepository } from '../category';
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
      | 'clearDocuments'
      | 'search'
    >
  >;
  let repo: jest.Mocked<
    Pick<
      ProductRepository,
      'findAll' | 'findByIdsForCards' | 'findOneForIndex' | 'findManyForIndex'
    >
  >;
  let categoryRepo: jest.Mocked<Pick<CategoryRepository, 'findAncestorIds'>>;

  beforeEach(() => {
    jest.clearAllMocks();
    meili = {
      isConfigured: jest.fn().mockReturnValue(true),
      ensureIndex: jest.fn().mockResolvedValue(undefined),
      indexDocuments: jest.fn().mockResolvedValue(undefined),
      deleteDocument: jest.fn().mockResolvedValue(undefined),
      clearDocuments: jest.fn().mockResolvedValue(undefined),
      search: jest.fn(),
    };
    repo = {
      findAll: jest.fn(),
      findByIdsForCards: jest.fn(),
      findOneForIndex: jest.fn(),
      findManyForIndex: jest.fn(),
    };
    // TASK-236: by default a category's ancestor chain is just itself; the
    // toDocument tests override it to prove the rollup expansion.
    categoryRepo = {
      findAncestorIds: jest.fn((id: string) => Promise.resolve([id])),
    };
    service = new SearchService(
      meili as unknown as MeiliClient,
      repo as unknown as ProductRepository,
      categoryRepo as unknown as CategoryRepository,
      loggerMock,
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
      expect(PRODUCTS_INDEX_SETTINGS.filterableAttributes).toEqual([
        'isActive',
        'categoryIds',
        'brandId',
        'deviceModelIds',
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

    it('injects Cyrillic search terms derived from name + category (TASK-200)', async () => {
      repo.findOneForIndex.mockResolvedValue(makeIndexSource() as never);

      await service.indexProduct('product-1');

      const [docs] = meili.indexDocuments.mock.calls[0];
      // "iPhone 15 Case" + "Cases" → айфон (brand) + чохол/чохли (case nouns),
      // so a typo'd UA query («афйон») matches via ordinary typo tolerance.
      expect(docs[0].searchTerms).toEqual(['айфон', 'чохол', 'чохли']);
    });

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
    it('clears the index then batch-adds active products', async () => {
      repo.findManyForIndex
        .mockResolvedValueOnce({ items: [makeIndexSource()] as never })
        .mockResolvedValueOnce({ items: [] });

      const count = await service.reindexAll();

      expect(meili.clearDocuments).toHaveBeenCalledTimes(1);
      expect(meili.indexDocuments).toHaveBeenCalledTimes(1);
      expect(count).toBe(1);
    });

    it('returns 0 without touching Meili when unconfigured', async () => {
      meili.isConfigured.mockReturnValue(false);
      const count = await service.reindexAll();
      expect(count).toBe(0);
      expect(meili.clearDocuments).not.toHaveBeenCalled();
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

      expect(repo.findAll).toHaveBeenCalledWith(
        expect.objectContaining({ search: 'case', isActive: true, page: 1, limit: 20 }),
      );
      expect(result.data).toHaveLength(1);
      expect(result.data[0]).toBeInstanceOf(PublicProductEntity);
    });

    it('uses Postgres directly when the engine is unconfigured', async () => {
      meili.isConfigured.mockReturnValue(false);
      repo.findAll.mockResolvedValue({ products: [], total: 0 } as never);

      const result = await service.search('case');

      expect(meili.search).not.toHaveBeenCalled();
      expect(repo.findAll).toHaveBeenCalled();
      expect(result.meta.limit).toBe(DEFAULT_SEARCH_LIMIT);
    });
  });

  // ─── suggest ─────────────────────────────────────────────────────────────────

  describe('suggest', () => {
    it('returns lightweight hits from the Meili index', async () => {
      meili.search.mockResolvedValue({
        hits: [
          {
            id: 'product-1',
            name: 'iPhone 15 Case',
            slug: 'iphone-15-case',
            price: 29.99,
            compareAtPrice: 39.99,
            primaryImageUrl: 'http://img/1.jpg',
          },
        ] as never,
        estimatedTotalHits: 1,
      });

      const res = await service.suggest('iphone');

      expect(meili.search).toHaveBeenCalledWith('iphone', {
        limit: SUGGEST_LIMIT,
        filter: ['isActive = true'],
      });
      expect(res).toEqual([
        {
          id: 'product-1',
          name: 'iPhone 15 Case',
          slug: 'iphone-15-case',
          price: '29.99',
          compareAtPrice: '39.99',
          primaryImageUrl: 'http://img/1.jpg',
        },
      ]);
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
        expect.objectContaining({ search: 'iphone', isActive: true, limit: SUGGEST_LIMIT }),
      );
      expect(res[0]).toEqual(
        expect.objectContaining({ id: 'product-1', slug: 'iphone-15-case', price: '29.99' }),
      );
    });
  });
});
