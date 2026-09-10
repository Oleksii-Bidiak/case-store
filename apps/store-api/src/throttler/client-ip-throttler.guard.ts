import { Injectable, type ExecutionContext } from '@nestjs/common';
import { ThrottlerGuard, type ThrottlerRequest } from '@nestjs/throttler';
import { FAIL_CLOSED_THROTTLE_KEY } from './fail-closed-throttle.decorator';
import {
  rateLimitStorageUnavailableError,
  ThrottlerStorageUnavailableError,
} from './throttler.errors';

/** The shape of the request fields this guard reads. */
interface TrackedRequest {
  ip?: string;
  ips?: string[];
  socket?: { remoteAddress?: string };
}

/**
 * ThrottlerGuard that states, in code, which address the rate limiter counts.
 *
 * ## Why this exists at all
 *
 * The library default is `getTracker(req) { return req.ip }`. That is the right
 * answer — but only once `trust proxy` is set, which it was not until TASK-386.
 * Behind Caddy, Express reported the proxy container's address for every visitor
 * on the internet, so the whole shop shared one 100-requests-per-minute bucket.
 * Spelling the tracker out here means the pairing is visible next to the limit
 * it governs instead of living implicitly in a library default and a line in
 * `main.ts` five hundred lines away.
 *
 * ## Why `req.ip` and NOT `req.ips[0]`
 *
 * The commonly-copied snippet is `req.ips.length ? req.ips[0] : req.ip`. It is
 * backwards, and dangerously so. `req.ips` is ordered upstream-first, so
 * `req.ips[0]` is the FURTHEST entry in `X-Forwarded-For` — the part an
 * untrusted client wrote. Caddy appends the real peer, so a request carrying
 * `X-Forwarded-For: 9.9.9.9` arrives as `9.9.9.9, <real>`: `req.ips[0]` is the
 * attacker's chosen value, and rotating it hands them an unlimited quota.
 * `req.ip` applies the `trust proxy` setting and yields the closest untrusted
 * address — the real client.
 *
 * The socket fallback covers non-HTTP or malformed contexts where Express has
 * not populated `ip`; returning a constant there would put every such request in
 * one bucket, which is the bug this class was written to remove.
 *
 * ## Why it also decides what happens when the counter store is down (TASK-401)
 *
 * `RedisThrottlerStorage` raises {@link ThrottlerStorageUnavailableError} when
 * it cannot reach Redis. It cannot decide the outcome itself — it does not know
 * whether it is counting a product listing or a login attempt, and those two
 * want opposite answers. The guard does know, so the choice lives here:
 *
 * - a route marked {@link FailClosedThrottle} (public writes: login, register,
 *   password reset, contact, review, order) → `503`, because serving it without
 *   a limiter is exactly the state this task removes;
 * - everything else → served, unlimited, as before. A Redis blip must not take
 *   the storefront's reads down with it.
 */
@Injectable()
export class ClientIpThrottlerGuard extends ThrottlerGuard {
  protected async getTracker(req: Record<string, unknown>): Promise<string> {
    const request = req as unknown as TrackedRequest;
    return request.ip ?? request.socket?.remoteAddress ?? 'unknown';
  }

  protected async handleRequest(requestProps: ThrottlerRequest): Promise<boolean> {
    try {
      return await super.handleRequest(requestProps);
    } catch (error) {
      // Anything else — including the library's own ThrottlerException for a
      // client that really is over the limit — keeps propagating untouched.
      if (!(error instanceof ThrottlerStorageUnavailableError)) {
        throw error;
      }

      if (this.isFailClosed(requestProps.context)) {
        throw rateLimitStorageUnavailableError();
      }

      // Fail open. Deliberately silent: the outage is already logged once by
      // ThrottlerRedisHealth and reported by /health, and a per-request line
      // here would produce one log entry per request for as long as it lasts.
      return true;
    }
  }

  /** Route-level (or controller-level) opt-in written by {@link FailClosedThrottle}. */
  private isFailClosed(context: ExecutionContext): boolean {
    return (
      this.reflector.getAllAndOverride<boolean>(FAIL_CLOSED_THROTTLE_KEY, [
        context.getHandler(),
        context.getClass(),
      ]) === true
    );
  }
}
