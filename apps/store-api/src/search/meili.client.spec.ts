import { ConfigService } from '@nestjs/config';
import { PinoLogger } from 'nestjs-pino';
import {
  MeiliClient,
  PRODUCTS_INDEX,
  type MeiliClientApi,
  type MeiliIndexApi,
  type IndexSettings,
  type ProductSearchDocument,
} from './meili.client';

// ─── Test doubles ───────────────────────────────────────────────────────────

const loggerMock = {
  setContext: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
} as unknown as PinoLogger;

/** ConfigService returning the given map (undefined for anything unset). */
function makeConfig(values: Record<string, string | undefined>): ConfigService {
  return { get: (key: string) => values[key] } as unknown as ConfigService;
}

function makeIndexMock(): jest.Mocked<MeiliIndexApi> {
  return {
    updateSettings: jest.fn().mockResolvedValue({ taskUid: 1 }),
    addDocuments: jest.fn().mockResolvedValue({ taskUid: 2 }),
    deleteDocument: jest.fn().mockResolvedValue({ taskUid: 3 }),
    deleteAllDocuments: jest.fn().mockResolvedValue({ taskUid: 4 }),
    search: jest.fn().mockResolvedValue({ hits: [], estimatedTotalHits: 0 }),
  };
}

function makeClientMock(index: MeiliIndexApi): jest.Mocked<MeiliClientApi> {
  return {
    health: jest.fn().mockResolvedValue({ status: 'available' }),
    index: jest.fn().mockReturnValue(index),
    createIndex: jest.fn().mockResolvedValue({ taskUid: 0 }),
    getIndex: jest.fn().mockResolvedValue({ uid: PRODUCTS_INDEX }),
  };
}

const SETTINGS: IndexSettings = {
  searchableAttributes: ['name', 'description', 'categoryName'],
  filterableAttributes: ['isActive', 'categoryId'],
  sortableAttributes: ['price', 'createdAt'],
  rankingRules: ['words', 'typo', 'proximity', 'attribute', 'sort', 'exactness'],
};

const DOC: ProductSearchDocument = {
  id: 'p1',
  name: 'iPhone 15 Case',
  description: 'Clear case',
  slug: 'iphone-15-case',
  price: 29.99,
  compareAtPrice: null,
  categoryId: 'c1',
  categoryName: 'Cases',
  primaryImageUrl: null,
  blurDataUrl: null,
  inStock: true,
  isActive: true,
  createdAt: 1_700_000_000_000,
};

describe('MeiliClient', () => {
  beforeEach(() => jest.clearAllMocks());

  describe('isConfigured', () => {
    it('is false when MEILI_HOST / MEILI_MASTER_KEY are absent', () => {
      const client = new MeiliClient(makeConfig({}), loggerMock);
      expect(client.isConfigured()).toBe(false);
    });

    it('is false when only the host is set', () => {
      const client = new MeiliClient(
        makeConfig({ MEILI_HOST: 'http://localhost:7700' }),
        loggerMock,
      );
      expect(client.isConfigured()).toBe(false);
    });

    it('is true when an SDK client is injected (spec/override path)', () => {
      const client = new MeiliClient(makeConfig({}), loggerMock, makeClientMock(makeIndexMock()));
      expect(client.isConfigured()).toBe(true);
    });
  });

  describe('unconfigured engine — every op is a safe no-op', () => {
    const client = new MeiliClient(makeConfig({}), loggerMock);

    it('health returns false without throwing', async () => {
      await expect(client.health()).resolves.toBe(false);
    });

    it('search returns null (signals "not available")', async () => {
      await expect(client.search('q')).resolves.toBeNull();
    });

    it('ensureIndex / indexDocuments / deleteDocument / clearDocuments resolve', async () => {
      await expect(client.ensureIndex(SETTINGS)).resolves.toBeUndefined();
      await expect(client.indexDocuments([DOC])).resolves.toBeUndefined();
      await expect(client.deleteDocument('p1')).resolves.toBeUndefined();
      await expect(client.clearDocuments()).resolves.toBeUndefined();
    });
  });

  describe('delegation to the SDK', () => {
    it('ensureIndex updates settings on the existing index', async () => {
      const index = makeIndexMock();
      const sdk = makeClientMock(index);
      const client = new MeiliClient(makeConfig({}), loggerMock, sdk);

      await client.ensureIndex(SETTINGS);

      expect(sdk.getIndex).toHaveBeenCalledWith(PRODUCTS_INDEX);
      expect(sdk.createIndex).not.toHaveBeenCalled();
      expect(index.updateSettings).toHaveBeenCalledWith(SETTINGS);
    });

    it('ensureIndex creates the index first when it does not exist', async () => {
      const index = makeIndexMock();
      const sdk = makeClientMock(index);
      sdk.getIndex.mockRejectedValueOnce(new Error('index_not_found'));
      const client = new MeiliClient(makeConfig({}), loggerMock, sdk);

      await client.ensureIndex(SETTINGS);

      expect(sdk.createIndex).toHaveBeenCalledWith(PRODUCTS_INDEX, { primaryKey: 'id' });
      expect(index.updateSettings).toHaveBeenCalledWith(SETTINGS);
    });

    it('indexDocuments delegates addDocuments with the id primary key', async () => {
      const index = makeIndexMock();
      const client = new MeiliClient(makeConfig({}), loggerMock, makeClientMock(index));

      await client.indexDocuments([DOC]);

      expect(index.addDocuments).toHaveBeenCalledWith([DOC], { primaryKey: 'id' });
    });

    it('indexDocuments is a no-op for an empty batch', async () => {
      const index = makeIndexMock();
      const client = new MeiliClient(makeConfig({}), loggerMock, makeClientMock(index));

      await client.indexDocuments([]);

      expect(index.addDocuments).not.toHaveBeenCalled();
    });

    it('deleteDocument / clearDocuments delegate to the index', async () => {
      const index = makeIndexMock();
      const client = new MeiliClient(makeConfig({}), loggerMock, makeClientMock(index));

      await client.deleteDocument('p1');
      await client.clearDocuments();

      expect(index.deleteDocument).toHaveBeenCalledWith('p1');
      expect(index.deleteAllDocuments).toHaveBeenCalled();
    });

    it('search maps hits + estimatedTotalHits', async () => {
      const index = makeIndexMock();
      index.search.mockResolvedValue({ hits: [DOC], estimatedTotalHits: 1 });
      const client = new MeiliClient(makeConfig({}), loggerMock, makeClientMock(index));

      const res = await client.search('iphone', { limit: 10 });

      expect(index.search).toHaveBeenCalledWith('iphone', { limit: 10 });
      expect(res).toEqual({ hits: [DOC], estimatedTotalHits: 1 });
    });

    it('health returns true when the engine reports "available"', async () => {
      const client = new MeiliClient(makeConfig({}), loggerMock, makeClientMock(makeIndexMock()));
      await expect(client.health()).resolves.toBe(true);
    });
  });

  describe('network failures never propagate', () => {
    it('search returns null on an SDK error', async () => {
      const index = makeIndexMock();
      index.search.mockRejectedValue(new Error('ECONNREFUSED'));
      const client = new MeiliClient(makeConfig({}), loggerMock, makeClientMock(index));

      await expect(client.search('q')).resolves.toBeNull();
    });

    it('health returns false on an SDK error', async () => {
      const sdk = makeClientMock(makeIndexMock());
      sdk.health.mockRejectedValue(new Error('ECONNREFUSED'));
      const client = new MeiliClient(makeConfig({}), loggerMock, sdk);

      await expect(client.health()).resolves.toBe(false);
    });

    it('indexDocuments swallows an SDK error', async () => {
      const index = makeIndexMock();
      index.addDocuments.mockRejectedValue(new Error('boom'));
      const client = new MeiliClient(makeConfig({}), loggerMock, makeClientMock(index));

      await expect(client.indexDocuments([DOC])).resolves.toBeUndefined();
    });
  });
});
