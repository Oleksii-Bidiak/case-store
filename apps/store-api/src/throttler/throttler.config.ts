import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { ThrottlerModuleOptions } from '@nestjs/throttler';
import Redis from 'ioredis';
import { RedisThrottlerStorage } from './redis-throttler-storage';
import type { ThrottlerRedisHealth } from './throttler-redis-health';

/** Default global window: 100 requests per 60 seconds. */
const DEFAULT_TTL_MS = 60000;
const DEFAULT_LIMIT = 100;
const DEFAULT_REDIS_PORT = 6379;

/**
 * How long the boot-time PING may take before Redis is called unreachable.
 *
 * Deliberately short: this runs inside module initialisation, so it is added to
 * every container start and to every `app.init()` in the test suites. Long
 * enough for a Redis container on the same compose network that is still
 * starting, short enough that a wrong `REDIS_HOST` fails fast instead of hanging
 * the boot.
 */
const PING_TIMEOUT_MS = 3000;

/**
 * The two calls {@link verifyThrottlerRedis} makes — narrower than `Redis` so
 * the check can be unit-tested without an ioredis instance or a socket.
 */
export interface PingableRedis {
  connect(): Promise<void>;
  ping(): Promise<string>;
}

export interface VerifyThrottlerRedisOptions {
  health: ThrottlerRedisHealth;
  /** `host:port`, for the log line and the boot error. */
  target: string;
  /** In production an unreachable limiter is a failed deploy, not a warning. */
  isProduction: boolean;
}

/**
 * Build ThrottlerModule options from configuration.
 *
 * When `REDIS_HOST` is set, rate-limit counters are stored in Redis (shared
 * across instances) under a `throttle:` key prefix — kept separate from the
 * product cache keys (`product:*`) that share the same Redis. Otherwise the
 * module falls back to the default in-memory store, so the app boots and
 * throttles correctly without a Redis dependency in local development.
 *
 * Since TASK-401 it also PINGS Redis before handing the storage over — see
 * {@link verifyThrottlerRedis} for why a lazily-connected client was not enough.
 */
export async function buildThrottlerOptions(
  configService: ConfigService,
  health: ThrottlerRedisHealth,
): Promise<ThrottlerModuleOptions> {
  const throttlers = [{ ttl: DEFAULT_TTL_MS, limit: DEFAULT_LIMIT }];
  const redisHost = configService.get<string>('REDIS_HOST');

  if (!redisHost) {
    health.markDisabled();
    return { throttlers };
  }

  const redisPort = configService.get<number>('REDIS_PORT', DEFAULT_REDIS_PORT);
  const redis = new Redis({
    host: redisHost,
    port: redisPort,
    password: configService.get<string>('REDIS_PASSWORD'),
    keyPrefix: 'throttle:',
    // One retry was a hair-trigger for a store whose failure now costs a 503 on
    // public writes: a single dropped packet during a Redis restart would refuse
    // a checkout. Two keeps the failure fast without flapping on a blip.
    maxRetriesPerRequest: 2,
    // Fail the command instead of queueing it while disconnected — an increment
    // that resolves after its response was sent counts nothing.
    enableOfflineQueue: false,
    connectTimeout: PING_TIMEOUT_MS,
    lazyConnect: true,
  });

  redis.on('error', (err) => {
    new Logger('ThrottlerRedis').warn(`Redis connection error: ${err.message}`);
  });

  await verifyThrottlerRedis(redis, {
    health,
    target: `${redisHost}:${redisPort}`,
    isProduction: configService.get<string>('NODE_ENV') === 'production',
  });

  return {
    throttlers,
    storage: new RedisThrottlerStorage(redis, health),
  };
}

/**
 * Ask Redis, at boot, whether it is actually there (TASK-401).
 *
 * ## Why a PING and not just `lazyConnect`
 *
 * The client was created lazily and only ever spoke to Redis from inside a
 * request — where the failure was swallowed. A wrong `REDIS_PASSWORD` therefore
 * produced one `warn` line in a log nobody was reading, on a stand that looked
 * healthy, and the rate limiter was off for the entire demo run. One explicit
 * round-trip at startup turns "silently unprotected" into something the operator
 * is told, and in production into a deploy that does not come up.
 *
 * Failing the boot in production follows the rule the required-env validation
 * already applies: a service that cannot enforce its auth rate limits is not
 * ready for traffic, and a restart loop is visible where a warning is not.
 */
export async function verifyThrottlerRedis(
  redis: PingableRedis,
  { health, target, isProduction }: VerifyThrottlerRedisOptions,
): Promise<void> {
  try {
    await redis.connect();
    await redis.ping();
    health.markReachable();
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);

    // Logs `throttler.redis.unreachable` at error level — the event to grep for.
    health.markUnreachable(reason);

    if (isProduction) {
      throw new Error(
        `Rate-limit store unreachable at ${target}: ${reason}. ` +
          'Refusing to start: auth, contact and order endpoints would accept unlimited requests.',
      );
    }
  }
}
