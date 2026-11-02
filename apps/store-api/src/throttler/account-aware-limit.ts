import type { ExecutionContext } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { authorFromAccessToken, type ReviewAuthorFromToken } from './throttler.config';

/** One verifier per secret — built lazily, the env is read at request time. */
let cached: { secret: string; verify: ReviewAuthorFromToken } | null = null;

function verifierFor(secret: string): ReviewAuthorFromToken {
  if (cached?.secret !== secret) {
    cached = { secret, verify: authorFromAccessToken(new JwtService({ secret }), secret) };
  }
  return cached.verify;
}

/**
 * A per-request `@Throttle` limit that gives a signed-in caller `accountLimit`
 * and everybody else `guestLimit` (TASK-2010 review).
 *
 * ## Why it verifies the token itself
 *
 * The throttler is a GLOBAL guard and global guards run before a route's own —
 * so when the limit is resolved, `OptionalJwtAuthGuard` has not run and
 * `request.user` is never set. A resolver that read `request.user` would hand
 * every caller the guest limit; one that trusted a bare `Authorization` header
 * would let any forged header buy the account allowance. So the bearer token is
 * verified here, with the access-token secret, exactly as the review-author
 * tracker does (TASK-598). Anything unverifiable is a guest.
 *
 * `JWT_SECRET` is read from the environment at request time: a decorator
 * argument has no injector, and env validation refuses to boot without it.
 */
export function accountAwareLimit(
  accountLimit: number,
  guestLimit: number,
): (context: ExecutionContext) => number {
  return (context) => {
    const request = context
      .switchToHttp()
      .getRequest<{ headers?: Record<string, string | string[] | undefined> }>();
    const header = request.headers?.authorization;
    const secret = process.env.JWT_SECRET;

    if (typeof header !== 'string' || !header.startsWith('Bearer ') || !secret) {
      return guestLimit;
    }

    return verifierFor(secret)(header.slice('Bearer '.length)) ? accountLimit : guestLimit;
  };
}
