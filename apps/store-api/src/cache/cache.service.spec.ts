import { Test, TestingModule } from '@nestjs/testing';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { PinoLogger } from 'nestjs-pino';
import { CacheService } from './cache.service';

describe('CacheService', () => {
  let service: CacheService;
  let cacheManagerMock: {
    get: jest.Mock;
    set: jest.Mock;
    del: jest.Mock;
    disconnect: jest.Mock;
    // cache-manager v7 replaced the single `store` with a `stores` array of
    // Keyv instances (TASK-304).
    stores?: unknown[];
  };

  beforeEach(async () => {
    cacheManagerMock = {
      get: jest.fn(),
      set: jest.fn(),
      del: jest.fn(),
      disconnect: jest.fn().mockResolvedValue(undefined),
    };

    const pinoLoggerMock = {
      info: jest.fn(),
      error: jest.fn(),
      warn: jest.fn(),
      debug: jest.fn(),
      setContext: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CacheService,
        { provide: CACHE_MANAGER, useValue: cacheManagerMock },
        { provide: PinoLogger, useValue: pinoLoggerMock },
      ],
    }).compile();

    service = module.get<CacheService>(CacheService);
  });

  // ─── get ──────────────────────────────────────────────────────────────────

  describe('get', () => {
    it('returns the cached value on HIT', async () => {
      cacheManagerMock.get.mockResolvedValue({ data: 'cached' });

      await expect(service.get('k')).resolves.toEqual({ data: 'cached' });
      expect(cacheManagerMock.get).toHaveBeenCalledWith('k');
    });

    it('returns null on MISS (undefined from store)', async () => {
      cacheManagerMock.get.mockResolvedValue(undefined);
      await expect(service.get('k')).resolves.toBeNull();
    });

    it('returns null and does not throw on backend error', async () => {
      cacheManagerMock.get.mockRejectedValue(new Error('redis down'));
      await expect(service.get('k')).resolves.toBeNull();
    });
  });

  // ─── set ──────────────────────────────────────────────────────────────────

  describe('set', () => {
    it('converts the TTL from seconds to milliseconds', async () => {
      cacheManagerMock.set.mockResolvedValue(undefined);

      await service.set('k', { a: 1 }, 300);

      expect(cacheManagerMock.set).toHaveBeenCalledWith('k', { a: 1 }, 300_000);
    });

    it('swallows backend errors (never throws)', async () => {
      cacheManagerMock.set.mockRejectedValue(new Error('redis down'));
      await expect(service.set('k', 'v', 60)).resolves.toBeUndefined();
    });
  });

  // ─── del ──────────────────────────────────────────────────────────────────

  describe('del', () => {
    it('deletes a single key', async () => {
      cacheManagerMock.del.mockResolvedValue(undefined);
      await service.del('k');
      expect(cacheManagerMock.del).toHaveBeenCalledWith('k');
    });

    it('swallows backend errors (never throws)', async () => {
      cacheManagerMock.del.mockRejectedValue(new Error('redis down'));
      await expect(service.del('k')).resolves.toBeUndefined();
    });
  });

  // ─── delByPrefix ────────────────────────────────────────────────────────────

  describe('delByPrefix', () => {
    it('uses SCAN + DEL when a Redis client is available', async () => {
      // TASK-304: node-redis (via @keyv/redis), not ioredis — SCAN takes an
      // options object and resolves to `{ cursor, keys }` with a NUMERIC
      // cursor, and DEL takes an array rather than varargs.
      const scan = jest
        .fn()
        // First page returns a non-zero cursor, second page terminates with 0.
        .mockResolvedValueOnce({ cursor: 7, keys: ['product:list:a', 'product:list:b'] })
        .mockResolvedValueOnce({ cursor: 0, keys: ['product:list:c'] });
      const del = jest.fn().mockResolvedValue(1);
      cacheManagerMock.stores = [{ store: { client: { scan, del } } }];

      await service.delByPrefix('product:list');

      expect(scan).toHaveBeenCalledTimes(2);
      expect(scan).toHaveBeenNthCalledWith(1, 0, { MATCH: 'product:list*', COUNT: 100 });
      expect(del).toHaveBeenCalledWith(['product:list:a', 'product:list:b']);
      expect(del).toHaveBeenCalledWith(['product:list:c']);
    });

    it('falls back to iterating the Keyv store when no Redis client is present', async () => {
      // cache-manager v7 dropped `store.keys()`; the equivalent is the Keyv
      // async `iterator()`, which yields [key, value] pairs.
      const iterator = jest.fn(async function* () {
        yield ['product:list:a', 1] as [string, unknown];
        yield ['product:detail:slug:x', 2] as [string, unknown];
        yield ['product:list:b', 3] as [string, unknown];
      });
      cacheManagerMock.stores = [{ iterator }];
      cacheManagerMock.del.mockResolvedValue(undefined);

      await service.delByPrefix('product:list');

      expect(cacheManagerMock.del).toHaveBeenCalledWith('product:list:a');
      expect(cacheManagerMock.del).toHaveBeenCalledWith('product:list:b');
      expect(cacheManagerMock.del).not.toHaveBeenCalledWith('product:detail:slug:x');
    });

    it('swallows backend errors (never throws)', async () => {
      const scan = jest.fn().mockRejectedValue(new Error('redis down'));
      cacheManagerMock.stores = [{ store: { client: { scan, del: jest.fn() } } }];

      await expect(service.delByPrefix('product:list')).resolves.toBeUndefined();
    });
  });

  // ─── onModuleDestroy (TASK-296) ───────────────────────────────────────────

  describe('onModuleDestroy', () => {
    it('disconnects the cache so the connection does not outlive the app', async () => {
      // cache-manager v7 exposes one `disconnect()` that tears down every
      // configured store, replacing the old reach into ioredis' `quit()`.
      await service.onModuleDestroy();

      expect(cacheManagerMock.disconnect).toHaveBeenCalledTimes(1);
    });

    it('never throws when the connection is already closed', async () => {
      cacheManagerMock.disconnect.mockRejectedValue(new Error('Connection is closed.'));

      await expect(service.onModuleDestroy()).resolves.toBeUndefined();
    });
  });
});
