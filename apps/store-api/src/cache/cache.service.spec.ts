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
    store?: unknown;
  };

  beforeEach(async () => {
    cacheManagerMock = {
      get: jest.fn(),
      set: jest.fn(),
      del: jest.fn(),
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
      const scan = jest
        .fn()
        // First page returns a non-zero cursor, second page terminates with "0".
        .mockResolvedValueOnce(['7', ['product:list:a', 'product:list:b']])
        .mockResolvedValueOnce(['0', ['product:list:c']]);
      const del = jest.fn().mockResolvedValue(1);
      cacheManagerMock.store = { client: { scan, del } };

      await service.delByPrefix('product:list');

      expect(scan).toHaveBeenCalledTimes(2);
      expect(scan).toHaveBeenNthCalledWith(1, '0', 'MATCH', 'product:list*', 'COUNT', 100);
      expect(del).toHaveBeenCalledWith('product:list:a', 'product:list:b');
      expect(del).toHaveBeenCalledWith('product:list:c');
    });

    it('falls back to store.keys() when no Redis client is present', async () => {
      const keys = jest
        .fn()
        .mockResolvedValue(['product:list:a', 'product:detail:slug:x', 'product:list:b']);
      cacheManagerMock.store = { keys };
      cacheManagerMock.del.mockResolvedValue(undefined);

      await service.delByPrefix('product:list');

      expect(cacheManagerMock.del).toHaveBeenCalledWith('product:list:a');
      expect(cacheManagerMock.del).toHaveBeenCalledWith('product:list:b');
      expect(cacheManagerMock.del).not.toHaveBeenCalledWith('product:detail:slug:x');
    });

    it('swallows backend errors (never throws)', async () => {
      const scan = jest.fn().mockRejectedValue(new Error('redis down'));
      cacheManagerMock.store = { client: { scan, del: jest.fn() } };

      await expect(service.delByPrefix('product:list')).resolves.toBeUndefined();
    });
  });
});
