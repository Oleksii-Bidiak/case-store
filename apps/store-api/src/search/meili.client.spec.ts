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
    deleteDocuments: jest.fn().mockResolvedValue({ taskUid: 5 }),
    getDocuments: jest.fn().mockResolvedValue({ results: [], total: 0 }),
    waitForTask: jest.fn().mockResolvedValue({ status: 'succeeded' }),
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
  searchableAttributes: ['name', 'description', 'categoryName', 'searchTerms'],
  filterableAttributes: ['isActive', 'categoryIds'],
  sortableAttributes: ['price', 'createdAt'],
  rankingRules: ['words', 'typo', 'proximity', 'attribute', 'sort', 'exactness'],
  synonyms: { айфон: ['iphone'], iphone: ['айфон'] },
};

const DOC: ProductSearchDocument = {
  id: 'p1',
  name: 'iPhone 15 Case',
  description: 'Clear case',
  slug: 'iphone-15-case',
  price: 29.99,
  compareAtPrice: null,
  categoryIds: ['c1'],
  categoryName: 'Cases',
  brandId: 'b1',
  brandName: 'Spigen',
  primaryImageUrl: null,
  blurDataUrl: null,
  inStock: true,
  isActive: true,
  createdAt: 1_700_000_000_000,
  searchTerms: ['айфон', 'чохол', 'чохли'],
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
      await expect(client.indexDocuments([DOC])).resolves.toBeNull();
      await expect(client.deleteDocument('p1')).resolves.toBeUndefined();
      await expect(client.clearDocuments()).resolves.toBeUndefined();
    });

    it('the reindex helpers report "unknown", never a false success', async () => {
      await expect(client.deleteDocuments(['p1'])).resolves.toBeNull();
      await expect(client.waitForTasks([1])).resolves.toEqual({ failedUids: [] });
      // null, NOT an empty set: "could not check" must never be read as
      // "index is empty", or the reindex prune would delete everything.
      await expect(client.listDocumentIds()).resolves.toBeNull();
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
      // Settings changes (e.g. new synonyms) must reach an ALREADY-EXISTING
      // index — ensureIndex pushes them on every call, not only on creation.
      expect(index.updateSettings).toHaveBeenCalledWith(
        expect.objectContaining({ synonyms: SETTINGS.synonyms }),
      );
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

    it('indexDocuments delegates addDocuments and returns the enqueued task uid', async () => {
      const index = makeIndexMock();
      const client = new MeiliClient(makeConfig({}), loggerMock, makeClientMock(index));

      const uid = await client.indexDocuments([DOC]);

      expect(index.addDocuments).toHaveBeenCalledWith([DOC], { primaryKey: 'id' });
      // The uid is what lets the caller distinguish "accepted into the queue"
      // from "actually applied" (TASK-376).
      expect(uid).toBe(2);
    });

    it('waitForTasks reports the uids that did not succeed', async () => {
      const index = makeIndexMock();
      index.waitForTask
        .mockResolvedValueOnce({ status: 'succeeded' })
        .mockResolvedValueOnce({ status: 'failed', error: { code: 'invalid_document' } });
      const client = new MeiliClient(makeConfig({}), loggerMock, makeClientMock(index));

      await expect(client.waitForTasks([7, 8])).resolves.toEqual({ failedUids: [8] });
    });

    it('waitForTasks counts an unverifiable task as failed', async () => {
      const index = makeIndexMock();
      index.waitForTask.mockRejectedValue(new Error('timeout'));
      const client = new MeiliClient(makeConfig({}), loggerMock, makeClientMock(index));

      await expect(client.waitForTasks([9])).resolves.toEqual({ failedUids: [9] });
    });

    it('listDocumentIds pages through the index', async () => {
      const index = makeIndexMock();
      index.getDocuments.mockResolvedValueOnce({ results: [{ id: 'a' }, { id: 'b' }], total: 2 });
      const client = new MeiliClient(makeConfig({}), loggerMock, makeClientMock(index));

      await expect(client.listDocumentIds()).resolves.toEqual(new Set(['a', 'b']));
      expect(index.getDocuments).toHaveBeenCalledWith({
        fields: ['id'],
        limit: 1000,
        offset: 0,
      });
    });

    it('listDocumentIds returns null (not an empty set) when the read fails', async () => {
      const index = makeIndexMock();
      index.getDocuments.mockRejectedValue(new Error('ECONNREFUSED'));
      const client = new MeiliClient(makeConfig({}), loggerMock, makeClientMock(index));

      await expect(client.listDocumentIds()).resolves.toBeNull();
    });

    it('deleteDocuments delegates the id batch and is a no-op when empty', async () => {
      const index = makeIndexMock();
      const client = new MeiliClient(makeConfig({}), loggerMock, makeClientMock(index));

      await expect(client.deleteDocuments(['p1', 'p2'])).resolves.toBe(5);
      expect(index.deleteDocuments).toHaveBeenCalledWith(['p1', 'p2']);

      index.deleteDocuments.mockClear();
      await expect(client.deleteDocuments([])).resolves.toBeNull();
      expect(index.deleteDocuments).not.toHaveBeenCalled();
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

    it('indexDocuments swallows an SDK error and reports no task', async () => {
      const index = makeIndexMock();
      index.addDocuments.mockRejectedValue(new Error('boom'));
      const client = new MeiliClient(makeConfig({}), loggerMock, makeClientMock(index));

      await expect(client.indexDocuments([DOC])).resolves.toBeNull();
    });
  });
});
