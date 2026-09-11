import { SetMetadata, type CustomDecorator } from '@nestjs/common';

/** Reflector key holding the fail-closed flag for a route (or a whole controller). */
export const FAIL_CLOSED_THROTTLE_KEY = 'throttler:failClosed';

/**
 * Mark a route as "rate limiting is part of its contract" (TASK-401).
 *
 * ## What it changes
 *
 * When the counter store is unreachable, {@link ClientIpThrottlerGuard} answers
 * `503 RATE_LIMIT_STORAGE_UNAVAILABLE` on a route carrying this decorator, and
 * lets every other route through unchecked (fail-open) as before.
 *
 * ## Where it belongs
 *
 * On unauthenticated — or cheaply authenticated — WRITE endpoints whose only
 * defence against brute force and spam IS the limiter: login, register,
 * password-reset request, contact, review submission, order creation. On those,
 * "the limiter is down" and "there is no limiter" are the same thing, and the
 * honest answer is to stop taking the request.
 *
 * ## Where it does NOT belong
 *
 * - GET routes. Reads are idempotent and are what a shop exists to serve;
 *   refusing them during a Redis blip would turn a degraded limiter into an
 *   outage of the whole storefront.
 * - `POST /api/payments/liqpay/callback`. It is `@SkipThrottle()`d — the only
 *   one in the codebase — because it is provider-to-server. A 503 there would
 *   make LiqPay retry, and eventually give up, on payments we already took.
 */
export const FailClosedThrottle = (): CustomDecorator<string> =>
  SetMetadata(FAIL_CLOSED_THROTTLE_KEY, true);
