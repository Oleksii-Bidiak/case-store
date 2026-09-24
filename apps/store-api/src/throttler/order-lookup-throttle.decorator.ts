import { SetMetadata, type CustomDecorator, type ExecutionContext } from '@nestjs/common';

/** Reflector key marking the route the per-order-number bucket applies to. */
export const ORDER_LOOKUP_THROTTLE_KEY = 'throttler:orderLookup';

/**
 * Name of the throttler that counts lookups per ORDER NUMBER (TASK-624).
 *
 * Exported because two places must agree on it: the options in
 * `throttler.config.ts` that declare the bucket, and
 * `ClientIpThrottlerGuard`, which logs `order.lookup_throttled` when THIS bucket —
 * and not the per-IP default beside it — is the one that refused a request.
 */
export const ORDER_LOOKUP_NUMBER_THROTTLER = 'orderLookupNumber';

/**
 * Prefix of a tracker that counts an order number (as opposed to the `ip:`
 * fallback for a body that names no order). The guard reads it to decide
 * whether a refusal is worth logging.
 */
export const ORDER_TRACKER_PREFIX = 'order:';

/**
 * Opt a route into the per-order-number lookup bucket (TASK-624).
 *
 * ## What it turns on
 *
 * The `orderLookupNumber` throttler declared in `throttler.config.ts`, which
 * counts requests by the normalised order number in the body instead of by the
 * caller's address. The limit lives THERE, next to the global default, for the
 * same reason the review limits do: a per-target cap and the per-IP cap beside
 * it only make sense read together.
 *
 * ## Why an opt-in marker, again
 *
 * `@nestjs/throttler` runs every configured throttler on every route unless it
 * is skipped. Without this gate the bucket would run on the catalogue and the
 * cart too — harmlessly keyed by address there, since those bodies carry no
 * order number, but capping the whole storefront at ten requests an hour per
 * visitor. See `ReviewSubmissionThrottle` for the long version.
 */
export const OrderLookupThrottle = (): CustomDecorator<string> =>
  SetMetadata(ORDER_LOOKUP_THROTTLE_KEY, true);

/**
 * Whether the route being handled opted in above — handler first, then class,
 * by hand because a `skipIf` receives the context and no reflector.
 */
export function isOrderLookupRoute(context: ExecutionContext): boolean {
  return (
    Reflect.getMetadata(ORDER_LOOKUP_THROTTLE_KEY, context.getHandler()) === true ||
    Reflect.getMetadata(ORDER_LOOKUP_THROTTLE_KEY, context.getClass()) === true
  );
}
