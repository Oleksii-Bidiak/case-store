import { SetMetadata, type CustomDecorator, type ExecutionContext } from '@nestjs/common';

/** Reflector key marking the routes the review-submission buckets apply to. */
export const REVIEW_SUBMISSION_THROTTLE_KEY = 'throttler:reviewSubmission';

/**
 * Opt a route into the two review-submission buckets (TASK-588).
 *
 * ## What it turns on
 *
 * The `reviewsAccount` (5 an hour, per author) and `reviewsIp` (20 a day, per
 * address) throttlers declared in `throttler.config.ts`. The limits live THERE,
 * next to each other and next to the global default, rather than here: an
 * account cap and an address cap only make sense read together, and a route-level
 * copy of the numbers is a second place for them to drift.
 *
 * ## Why an opt-in marker exists at all
 *
 * `@nestjs/throttler` applies EVERY configured throttler to EVERY route unless
 * that throttler is skipped for it. Naming a five-an-hour bucket and stopping
 * there would therefore cap the whole storefront — catalogue reads included — at
 * five requests an hour, and the symptom would be a shop that 429s after five
 * clicks with nothing in the logs to say why. So both review throttlers carry a
 * `skipIf` that skips every route WITHOUT this marker, and this decorator is how
 * a route says "count me".
 *
 * The marker is our own key rather than a probe for the library's per-route
 * `@Throttle` metadata: those constants (`THROTTLER:LIMIT` and friends) are not
 * part of the package's public API, and reading them would make the gate depend
 * on an internal that can change in a patch release.
 */
export const ReviewSubmissionThrottle = (): CustomDecorator<string> =>
  SetMetadata(REVIEW_SUBMISSION_THROTTLE_KEY, true);

/**
 * Whether the route being handled opted in above. Handler first, then the
 * controller class — the same precedence `Reflector.getAllAndOverride` uses, done
 * by hand because a `skipIf` is called with the context alone and has no
 * reflector.
 */
export function isReviewSubmissionRoute(context: ExecutionContext): boolean {
  return (
    Reflect.getMetadata(REVIEW_SUBMISSION_THROTTLE_KEY, context.getHandler()) === true ||
    Reflect.getMetadata(REVIEW_SUBMISSION_THROTTLE_KEY, context.getClass()) === true
  );
}
