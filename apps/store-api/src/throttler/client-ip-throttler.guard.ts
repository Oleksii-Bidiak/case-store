import { Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';

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
 */
@Injectable()
export class ClientIpThrottlerGuard extends ThrottlerGuard {
  protected async getTracker(req: Record<string, unknown>): Promise<string> {
    const request = req as unknown as TrackedRequest;
    return request.ip ?? request.socket?.remoteAddress ?? 'unknown';
  }
}
