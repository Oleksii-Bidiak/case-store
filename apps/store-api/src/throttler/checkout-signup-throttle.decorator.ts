import { SetMetadata, type CustomDecorator, type ExecutionContext } from '@nestjs/common';

/** Reflector key marking the routes the checkout sign-up bucket applies to. */
export const CHECKOUT_SIGNUP_THROTTLE_KEY = 'throttler:checkoutSignup';

/** Name of the throttler that counts accounts created at checkout (TASK-2010). */
export const CHECKOUT_SIGNUP_THROTTLER = 'checkoutSignup';

/**
 * When a marked route is counted:
 *
 * - `always` — every request creates an account (`POST /orders/guest/{token}/account`);
 * - `createAccount` — only a request whose body says `contact.createAccount: true`
 *   (`POST /orders`). A guest order without the box creates nothing and keeps
 *   only the route's own 3/min guest limit, so it must not spend this quota.
 */
export type CheckoutSignupThrottleMode = 'always' | 'createAccount';

/**
 * Opt a route into the five-accounts-an-hour-per-address bucket (TASK-2010,
 * B-12 тема 2 (е): «rate limit на створення акаунта в чекауті»).
 *
 * The limit lives in `throttler.config.ts`, next to the other named buckets;
 * this marker only says which routes it counts — the same opt-in pattern as
 * `ReviewSubmissionThrottle` and `OrderLookupThrottle`, for the same reason: a
 * configured throttler otherwise runs on EVERY route.
 */
export const CheckoutSignupThrottle = (mode: CheckoutSignupThrottleMode): CustomDecorator<string> =>
  SetMetadata(CHECKOUT_SIGNUP_THROTTLE_KEY, mode);

/**
 * Whether THIS request is one the bucket counts. Handler metadata only — the
 * marker is never put on a class.
 *
 * The body is read RAW: the throttler is a global guard and guards run before
 * pipes, so the DTO has not validated anything yet. That is why only a literal
 * `true` counts — `"true"` or `1` would be refused by the DTO's `@IsBoolean`
 * and create no account, so it must not spend the quota either.
 */
export function isCheckoutSignupRequest(context: ExecutionContext): boolean {
  const mode = Reflect.getMetadata(CHECKOUT_SIGNUP_THROTTLE_KEY, context.getHandler()) as
    CheckoutSignupThrottleMode | undefined;

  if (mode === 'always') return true;
  if (mode !== 'createAccount') return false;

  const body = context.switchToHttp().getRequest<{ body?: unknown }>().body as
    { contact?: { createAccount?: unknown } } | null | undefined;
  return body?.contact?.createAccount === true;
}
