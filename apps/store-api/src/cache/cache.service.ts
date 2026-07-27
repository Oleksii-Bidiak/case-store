import { Inject, Injectable, type OnModuleDestroy } from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { PinoLogger } from 'nestjs-pino';
import type { Cache } from 'cache-manager';

/**
 * Minimal shape of the node-redis client used for non-blocking prefix deletion.
 *
 * TASK-304: `@keyv/redis` is backed by node-redis (`@redis/client`), not
 * ioredis, and the two SCAN APIs differ — node-redis takes an options object
 * and resolves to `{ cursor, keys }`, where ioredis took positional
 * MATCH/COUNT tokens and resolved to a `[cursor, keys]` tuple. `del` likewise
 * takes an array rather than varargs. The in-memory store has no client at all
 * (we fall back to iterating the Keyv store there).
 */
interface ScanCapableClient {
  scan(
    cursor: number,
    options: { MATCH: string; COUNT: number },
  ): Promise<{ cursor: number; keys: string[] }>;
  del(keys: string[]): Promise<number>;
}

/** Minimal shape of a Keyv store entry exposed by `cache-manager`'s `stores`. */
interface IterableKeyvStore {
  iterator?: (namespace?: string) => AsyncGenerator<[string, unknown], void, unknown>;
  store?: { client?: unknown };
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
 * NOTE on TTL units: cache-manager measures TTL in **milliseconds**. This
 * wrapper accepts TTL in **seconds** (matching `REDIS_CACHE_TTL_SECONDS`) and
 * converts internally, so callers never juggle units.
 *
 * NOTE on the stored value format (TASK-304): Keyv wraps every entry as
 * `{ value, expires }`, which is NOT how cache-manager v5 wrote them. Entries
 * written by the previous release are therefore unreadable after deploy. That
 * is safe — an unreadable entry is just a miss and the caller falls through to
 * the database — but the cache starts cold, so expect one burst of DB reads on
 * the first deploy that carries this change.
 */
@Injectable()
export class CacheService implements OnModuleDestroy {
  constructor(
    @Inject(CACHE_MANAGER) private readonly cacheManager: Cache,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(CacheService.name);
  }

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
    let cursor = 0;
    do {
      const { cursor: next, keys } = await client.scan(cursor, {
        MATCH: `${prefix}*`,
        COUNT: 100,
      });
      cursor = next;
      if (keys.length > 0) {
        await client.del(keys);
      }
    } while (cursor !== 0);
  }

  /**
   * In-memory fallback: enumerate keys and delete the matching ones.
   *
   * cache-manager v7 no longer exposes a `store.keys()`; the equivalent is the
   * Keyv async `iterator()`, which yields `[key, value]` pairs.
   */
  private async memoryDeleteByPrefix(prefix: string): Promise<void> {
    const store = this.getKeyvStore();
    if (!store?.iterator) return;

    const matching: string[] = [];
    for await (const [key] of store.iterator()) {
      if (key.startsWith(prefix)) matching.push(key);
    }
    await Promise.all(matching.map((k) => this.cacheManager.del(k)));
  }

  /**
   * Close the Redis connection on shutdown (TASK-296).
   *
   * Without this the connection (and its reconnect timer) outlives
   * `app.close()` — a handle leak in any process that boots more than one app,
   * i.e. every test run. cache-manager v7 exposes a single `disconnect()` that
   * tears down every configured store, which replaces the old reach into the
   * ioredis client's `quit()`. The in-memory store makes it a no-op.
   */
  async onModuleDestroy(): Promise<void> {
    try {
      await this.cacheManager.disconnect();
    } catch {
      // Already closed, or never connected — nothing left to release.
    }
  }

  /**
   * The first configured Keyv store, if any.
   *
   * cache-manager v7 replaced the single `cache.store` with a `cache.stores`
   * array (one Keyv per configured backend). We only ever configure one.
   */
  private getKeyvStore(): IterableKeyvStore | undefined {
    const stores = (this.cacheManager as unknown as { stores?: IterableKeyvStore[] }).stores;
    return Array.isArray(stores) ? stores[0] : undefined;
  }

  /**
   * Return the node-redis client when the active store is Redis-backed, else
   * `undefined`. Detected structurally so the in-memory store is handled
   * transparently.
   */
  private getScanClient(): ScanCapableClient | undefined {
    const client = this.getKeyvStore()?.store?.client;
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
