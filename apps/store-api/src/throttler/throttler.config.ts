import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { ThrottlerModuleOptions, ThrottlerOptions } from '@nestjs/throttler';
import Redis from 'ioredis';
import { RedisThrottlerStorage } from './redis-throttler-storage';
import { isReviewSubmissionRoute } from './review-submission-throttle.decorator';
import type { ThrottlerRedisHealth } from './throttler-redis-health';

/** Default global window: 100 requests per 60 seconds. */
const DEFAULT_TTL_MS = 60000;
const DEFAULT_LIMIT = 100;
const DEFAULT_REDIS_PORT = 6379;

const ONE_HOUR_MS = 60 * 60 * 1000;
const ONE_DAY_MS = 24 * ONE_HOUR_MS;

/** Ratings one ACCOUNT may submit per hour (the owner's decision 7). */
const REVIEWS_PER_ACCOUNT_PER_HOUR = 5;
/** Ratings one ADDRESS may submit per day, however many accounts it uses. */
const REVIEWS_PER_IP_PER_DAY = 20;

/**
 * Who the per-account review bucket counts (TASK-588).
 *
 * ## Why the route needs a tracker of its own
 *
 * The guard's tracker is the client IP, which is the right answer for almost
 * everything and the wrong one here: an account limit that counts addresses is
 * not an account limit. One person on a phone changing networks would get a
 * fresh five every time, and five people in an office would share one.
 * `ThrottlerGuard` resolves `namedThrottler.getTracker` ahead of its own, so
 * naming this on the throttler is what makes the account bucket count accounts.
 *
 * ## Why it must never return a constant
 *
 * The route is behind `JwtAuthGuard`, so `req.user` is always there — but "always"
 * is an assumption about a guard declared in another file, and the cost of it
 * being wrong is specific: a constant tracker puts every submitter on earth into
 * ONE five-an-hour bucket. That is TASK-386's shared bucket, reintroduced at the
 * single route this task exists to protect, and it would present as "reviews are
 * broken for everyone" rather than as a limiter bug. So an unauthenticated
 * request degrades to its address — a real per-client cap, merely a stricter one
 * than intended — and a request with neither is refused outright.
 *
 * `user:` / `ip:` prefixes because the two namespaces share one bucket name, and
 * an id that happened to look like an address should not be able to collide with
 * one.
 */
export function trackReviewAuthor(req: Record<string, unknown>): Promise<string> {
  const request = req as {
    user?: { id?: string };
    ip?: string;
    socket?: { remoteAddress?: string };
  };

  const userId = request.user?.id;
  if (userId) {
    return Promise.resolve(`user:${userId}`);
  }

  const address = request.ip ?? request.socket?.remoteAddress;
  if (address) {
    return Promise.resolve(`ip:${address}`);
  }

  return Promise.reject(
    new Error(
      'Cannot build a review-submission tracker: the request carries neither an ' +
        'authenticated author nor a client address. Refusing rather than counting ' +
        'every submitter in one shared bucket.',
    ),
  );
}

/**
 * The two buckets guarding review submission, per the owner's decision 7
 * (`docs/plans/178-brainstorms.md`): five an hour from one ACCOUNT, twenty a day
 * from one ADDRESS.
 *
 * ## Two names, not one combined cap
 *
 * They answer different questions — "is this person reviewing the whole
 * catalogue?" versus "is this address running a farm of accounts?" — and the
 * guard folds the throttler NAME into its storage key, so two names are two
 * genuinely independent counters. One bucket serving both is the TASK-386
 * mistake in miniature: whichever question is asked second gets an answer that
 * belongs to the first.
 *
 * `reviewsIp` deliberately declares NO `getTracker`, so it inherits
 * {@link ClientIpThrottlerGuard}'s per-IP one. Spelling a second tracker out here
 * is how the two buckets would quietly end up counting the same thing.
 *
 * ## Why both carry `skipIf`
 *
 * A configured throttler runs on EVERY route unless it is skipped. Without this
 * the five-an-hour bucket would apply to the catalogue, the cart and the
 * checkout, and the shop would 429 after five clicks. See
 * {@link ReviewSubmissionThrottle} for the opt-in marker these read.
 */
const onlyOnReviewSubmission: ThrottlerOptions['skipIf'] = (context) =>
  !isReviewSubmissionRoute(context);

const REVIEW_SUBMISSION_THROTTLERS: ThrottlerOptions[] = [
  {
    name: 'reviewsAccount',
    limit: REVIEWS_PER_ACCOUNT_PER_HOUR,
    ttl: ONE_HOUR_MS,
    getTracker: trackReviewAuthor,
    skipIf: onlyOnReviewSubmission,
  },
  {
    name: 'reviewsIp',
    limit: REVIEWS_PER_IP_PER_DAY,
    ttl: ONE_DAY_MS,
    skipIf: onlyOnReviewSubmission,
  },
];

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
  const throttlers: ThrottlerOptions[] = [
    { ttl: DEFAULT_TTL_MS, limit: DEFAULT_LIMIT },
    ...REVIEW_SUBMISSION_THROTTLERS,
  ];
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
      // Names the class of routes instead of listing them: the old enumeration
      // was already wrong (it omitted reviews, then newsletter) and any list
      // here rots the next time a public write is added (TASK-464).
      throw new Error(
        `Rate-limit store unreachable at ${target}: ${reason}. ` +
          'Refusing to start: with no counter store every rate-limited route — the ' +
          'unauthenticated public writes above all — would accept unlimited requests.',
      );
    }
  }
}
