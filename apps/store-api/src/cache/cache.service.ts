import { Inject, Injectable, Logger } from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import type { Cache } from 'cache-manager';

/**
 * Minimal shape of an ioredis-style client used for non-blocking prefix
 * deletion. `cache-manager-ioredis-yet` exposes its ioredis instance as
 * `store.client`; the in-memory store has no such client (we fall back to
 * `store.keys()` there).
 */
interface ScanCapableClient {
  scan(
    cursor: string | number,
    matchToken: 'MATCH',
    pattern: string,
    countToken: 'COUNT',
    count: number,
  ): Promise<[string, string[]]>;
  del(...keys: string[]): Promise<number>;
}

/**
 * Thin, fault-isolated wrapper around the cache-manager `Cache` instance.
 *
 * Every method swallows backend errors: a Redis outage must never turn a cache
 * lookup into a 5xx. `get` returns `null` on miss OR error so the caller simply
 * treats it as a cache miss and reads from the database; writes/evictions log
 * and return. This is the ONLY place in the codebase that touches
 * `CACHE_MANAGER` or handles cache degradation — consumers depend on this
 * service, never on cache-manager directly.
 *
 * NOTE on TTL units: cache-manager v5 measures TTL in **milliseconds**. This
 * wrapper accepts TTL in **seconds** (matching `REDIS_CACHE_TTL_SECONDS`) and
 * converts internally, so callers never juggle units.
 */
@Injectable()
export class CacheService {
  private readonly logger = new Logger(CacheService.name);

  constructor(@Inject(CACHE_MANAGER) private readonly cacheManager: Cache) {}

  /** Get a cached value, or `null` on miss or any backend error. */
  async get<T>(key: string): Promise<T | null> {
    try {
      const value = await this.cacheManager.get<T>(key);
      if (value === undefined || value === null) {
        this.logger.debug(`Cache MISS ${key}`);
        return null;
      }
      this.logger.debug(`Cache HIT ${key}`);
      return value;
    } catch (err) {
      this.logger.error({ err, key }, 'Cache GET error — falling through to DB');
      return null;
    }
  }

  /**
   * Store a value with a TTL (in seconds). Never throws — a failed write is
   * logged and the caller's response is returned uncached.
   */
  async set(key: string, value: unknown, ttlSeconds: number): Promise<void> {
    try {
      await this.cacheManager.set(key, value, ttlSeconds * 1000);
    } catch (err) {
      this.logger.error({ err, key }, 'Cache SET error — response not cached');
    }
  }

  /** Delete a single key. Never throws. */
  async del(key: string): Promise<void> {
    try {
      await this.cacheManager.del(key);
    } catch (err) {
      this.logger.error({ err, key }, 'Cache DEL error');
    }
  }

  /**
   * Delete every key under a prefix. On a real Redis backend this uses a
   * non-blocking `SCAN` + `DEL` cursor loop (never the blocking `KEYS`). On the
   * in-memory fallback store it enumerates `store.keys()` and filters. Never
   * throws.
   */
  async delByPrefix(prefix: string): Promise<void> {
    try {
      const client = this.getScanClient();
      if (client) {
        await this.scanAndDelete(client, prefix);
        return;
      }
      await this.memoryDeleteByPrefix(prefix);
    } catch (err) {
      this.logger.error({ err, prefix }, 'Cache DEL-by-prefix error');
    }
  }

  /** Non-blocking SCAN + DEL loop over a real Redis backend. */
  private async scanAndDelete(client: ScanCapableClient, prefix: string): Promise<void> {
    let cursor = '0';
    do {
      const [next, keys] = await client.scan(cursor, 'MATCH', `${prefix}*`, 'COUNT', 100);
      cursor = next;
      if (keys.length > 0) {
        await client.del(...keys);
      }
    } while (cursor !== '0');
  }

  /** In-memory fallback: enumerate keys and delete the matching ones. */
  private async memoryDeleteByPrefix(prefix: string): Promise<void> {
    const store = this.getStore();
    const keys = (await store?.keys?.()) ?? [];
    await Promise.all(
      keys.filter((k) => k.startsWith(prefix)).map((k) => this.cacheManager.del(k)),
    );
  }

  /** The underlying cache-manager store, if reachable. */
  private getStore(): { keys?: () => Promise<string[]> } | undefined {
    return (this.cacheManager as unknown as { store?: { keys?: () => Promise<string[]> } }).store;
  }

  /**
   * Return the ioredis client when the active store is Redis-backed, else
   * `undefined`. Detected structurally so the in-memory store is handled
   * transparently.
   */
  private getScanClient(): ScanCapableClient | undefined {
    const client = (this.cacheManager as unknown as { store?: { client?: unknown } }).store?.client;
    if (
      client &&
      typeof (client as ScanCapableClient).scan === 'function' &&
      typeof (client as ScanCapableClient).del === 'function'
    ) {
      return client as ScanCapableClient;
    }
    return undefined;
  }
}
