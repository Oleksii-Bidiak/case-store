import { Injectable, Logger, type ExecutionContext } from '@nestjs/common';
import { ThrottlerException, ThrottlerGuard, type ThrottlerRequest } from '@nestjs/throttler';
import { FAIL_CLOSED_THROTTLE_KEY } from './fail-closed-throttle.decorator';
import {
  ORDER_LOOKUP_NUMBER_THROTTLER,
  ORDER_TRACKER_PREFIX,
} from './order-lookup-throttle.decorator';
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
 * Module-level rather than a field: the guard's unit tests build it with
 * `Object.create(prototype)`, which skips field initialisers.
 */
const logger = new Logger('ClientIpThrottlerGuard');

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
      if (error instanceof ThrottlerException) {
        await this.reportOrderLookupLockout(requestProps);
        throw error;
      }

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

  /**
   * Say so when the per-order-number bucket refuses a lookup (TASK-624).
   *
   * Per-IP 429s are routine and stay silent. THIS one means a single order has
   * been asked about more than its hourly budget allows — from however many
   * addresses — which is the shape of someone walking phone numbers against a
   * number found on a waybill. `order.lookup_miss` is logged without the number
   * on purpose, so without this line there was nothing to correlate.
   *
   * `target` is the tracker itself: an HMAC fingerprint of the order number
   * (see `orderNumberFingerprint`), stable across addresses and meaningless
   * without the server secret. The raw number is never written down. A tracker
   * that fell back to the address (malformed number — no order to protect) is
   * not reported.
   */
  private async reportOrderLookupLockout(requestProps: ThrottlerRequest): Promise<void> {
    const { context, throttler, getTracker, limit, ttl } = requestProps;
    if (throttler.name !== ORDER_LOOKUP_NUMBER_THROTTLER) {
      return;
    }

    const req = context.switchToHttp().getRequest<Record<string, unknown>>();
    const tracker = await getTracker(req, context);
    if (!tracker.startsWith(ORDER_TRACKER_PREFIX)) {
      return;
    }

    logger.warn(
      {
        event: 'order.lookup_throttled',
        target: tracker.slice(ORDER_TRACKER_PREFIX.length),
        limit,
        windowMs: ttl,
      },
      'Order lookup refused: one order number exceeded its hourly lookup budget',
    );
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
