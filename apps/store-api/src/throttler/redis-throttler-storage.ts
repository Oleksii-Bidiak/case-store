import { Logger } from '@nestjs/common';
import type { ThrottlerStorage } from '@nestjs/throttler';
import type Redis from 'ioredis';

/**
 * Return shape of {@link ThrottlerStorage.increment}. `@nestjs/throttler` does
 * not re-export this interface from its package root, so it is mirrored here.
 */
interface ThrottlerStorageRecord {
  totalHits: number;
  timeToExpire: number;
  isBlocked: boolean;
  timeToBlockExpire: number;
}

/**
 * Redis-backed {@link ThrottlerStorage}.
 *
 * Replaces the default in-memory store so rate-limit counters are shared across
 * every API instance behind a load balancer — the 5-req/60s limit on auth
 * endpoints applies globally, not per-process.
 *
 * The counter logic mirrors the official in-memory `ThrottlerStorageService`:
 * a hit counter with a TTL plus a separate block key. It runs as a single Lua
 * script so the read-modify-write is atomic under concurrency.
 *
 * Degradation: if Redis is unreachable the storage fails OPEN (allows the
 * request) and logs a warning, prioritising availability — the same philosophy
 * as the Redis cache layer. When `REDIS_HOST` is unset the module never
 * constructs this class and the in-memory store is used instead.
 */
export class RedisThrottlerStorage implements ThrottlerStorage {
  private readonly logger = new Logger(RedisThrottlerStorage.name);

  // KEYS[1]=hit counter, KEYS[2]=block flag.
  // ARGV[1]=ttl(ms), ARGV[2]=limit, ARGV[3]=blockDuration(ms).
  // Returns { totalHits, hitPttl(ms), isBlocked(0|1), blockPttl(ms) }.
  private static readonly SCRIPT = `
    local hitKey = KEYS[1]
    local blockKey = KEYS[2]
    local ttl = tonumber(ARGV[1])
    local limit = tonumber(ARGV[2])
    local blockDuration = tonumber(ARGV[3])

    local blockPttl = redis.call('PTTL', blockKey)
    if blockPttl > 0 then
      local hits = tonumber(redis.call('GET', hitKey) or '0')
      local hitPttl = redis.call('PTTL', hitKey)
      if hitPttl < 0 then hitPttl = 0 end
      return {hits, hitPttl, 1, blockPttl}
    end

    local hits = redis.call('INCR', hitKey)
    if hits == 1 then
      redis.call('PEXPIRE', hitKey, ttl)
    end
    local hitPttl = redis.call('PTTL', hitKey)
    if hitPttl < 0 then
      redis.call('PEXPIRE', hitKey, ttl)
      hitPttl = ttl
    end

    local isBlocked = 0
    local blockExpire = 0
    if hits > limit then
      redis.call('SET', blockKey, '1', 'PX', blockDuration)
      isBlocked = 1
      blockExpire = blockDuration
    end

    return {hits, hitPttl, isBlocked, blockExpire}
  `;

  constructor(private readonly redis: Redis) {}

  async increment(
    key: string,
    ttl: number,
    limit: number,
    blockDuration: number,
    throttlerName: string,
  ): Promise<ThrottlerStorageRecord> {
    const hitKey = `${throttlerName}:${key}`;
    const blockKey = `${hitKey}:block`;

    try {
      const reply = (await this.redis.eval(
        RedisThrottlerStorage.SCRIPT,
        2,
        hitKey,
        blockKey,
        ttl,
        limit,
        blockDuration,
      )) as [number, number, number, number];

      const [totalHits, hitPttl, isBlocked, blockPttl] = reply;
      return {
        totalHits,
        timeToExpire: msToSeconds(hitPttl),
        isBlocked: isBlocked === 1,
        timeToBlockExpire: msToSeconds(blockPttl),
      };
    } catch (error) {
      // Fail open — never 500 the whole API because the rate-limit store blinked.
      this.logger.warn(
        `Redis throttler unavailable, allowing request: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      return {
        totalHits: 0,
        timeToExpire: msToSeconds(ttl),
        isBlocked: false,
        timeToBlockExpire: 0,
      };
    }
  }
}

/** Convert milliseconds to whole seconds (rounded up), matching the in-memory store. */
function msToSeconds(ms: number): number {
  return Math.ceil(ms / 1000);
}
