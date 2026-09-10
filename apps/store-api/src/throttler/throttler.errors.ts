import { ServiceUnavailableException } from '@nestjs/common';

/**
 * Stable, machine-readable error codes for the rate limiter (TASK-401).
 *
 * Same shape and same reasoning as `order/order.errors.ts` (TASK-332): the
 * storefront and the admin panel key their localized (UA) copy off these
 * strings, so they must stay stable even when the human-readable message is
 * reworded.
 *
 * They reach the client through the HTTP error envelope's `error` field — see
 * {@link HttpExceptionFilter}, which surfaces ONLY `resp.error` and
 * `resp.message` and silently discards any other property on the thrown body.
 * That is why the exception below is built as `{ error, message }` and carries
 * no extra diagnostic fields: they would never reach the wire.
 */
export const ThrottlerErrorCode = {
  /**
   * The rate-limit counter store (Redis) is unreachable, and the route asked to
   * be protected rather than available — see {@link FailClosedThrottle}.
   */
  STORAGE_UNAVAILABLE: 'RATE_LIMIT_STORAGE_UNAVAILABLE',
} as const;

export type ThrottlerErrorCode = (typeof ThrottlerErrorCode)[keyof typeof ThrottlerErrorCode];

/**
 * Internal signal raised by {@link RedisThrottlerStorage} when the counter could
 * not be read or written.
 *
 * It is deliberately NOT an `HttpException`: the storage layer does not get to
 * decide the HTTP outcome. {@link ClientIpThrottlerGuard} catches this and picks
 * per route — 503 for a public write, "allow" for everything else. Any other
 * error from the storage keeps propagating as the bug it is.
 */
export class ThrottlerStorageUnavailableError extends Error {
  constructor(readonly reason: string) {
    super(`Rate-limit storage unavailable: ${reason}`);
    this.name = 'ThrottlerStorageUnavailableError';
  }
}

/**
 * 503 for a public write we refused to serve without a working rate limiter.
 *
 * The alternative — serving it anyway — is what this task exists to remove: with
 * Redis misconfigured on the demo stand, the login, register, password-reset and
 * contact endpoints accepted unlimited attempts and nothing said so.
 */
export function rateLimitStorageUnavailableError(): ServiceUnavailableException {
  return new ServiceUnavailableException({
    error: ThrottlerErrorCode.STORAGE_UNAVAILABLE,
    message:
      'Rate limiting is temporarily unavailable, so this request was not accepted. Please try again in a minute.',
  });
}
