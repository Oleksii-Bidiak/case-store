import 'reflect-metadata';
import { AuthController } from '../auth/auth.controller';
import { ContactController } from '../contact/contact.controller';
import { NewsletterController } from '../newsletter/newsletter.controller';
import { OrderController } from '../order/order.controller';
import { LiqPayWebhookController } from '../payment/liqpay-webhook.controller';
import { ProductController } from '../product/product.controller';
import { ReviewController } from '../review/review.controller';
import { ReviewUpdateController } from '../review/review-update.controller';
import { FAIL_CLOSED_THROTTLE_KEY } from './fail-closed-throttle.decorator';
import { REVIEW_SUBMISSION_THROTTLE_KEY } from './review-submission-throttle.decorator';

/**
 * TASK-401 — WHICH routes refuse to be served without a working rate limiter.
 *
 * The guard's behaviour is tested next door; this file tests the classification,
 * because that is the half that rots. A route added to `auth.controller.ts`
 * tomorrow, or a decorator dropped in a merge, would leave the guard perfectly
 * correct and the endpoint perfectly unprotected — which is exactly the shape of
 * the original defect: nothing errors, nothing logs, the limit is simply gone.
 *
 * Reading the metadata directly (the same technique as
 * `contact.controller.spec.ts`) proves the wiring without booting Nest, a
 * database or Redis.
 */
const isFailClosed = (handler: unknown): unknown =>
  Reflect.getMetadata(FAIL_CLOSED_THROTTLE_KEY, handler as object);

describe('Fail-closed route classification', () => {
  describe('public writes refuse to run without a limiter', () => {
    it.each([
      ['POST /api/contact', ContactController.prototype.submit],
      ['POST /api/auth/register', AuthController.prototype.register],
      ['POST /api/auth/login', AuthController.prototype.login],
      ['POST /api/auth/password-reset/request', AuthController.prototype.requestPasswordReset],
      ['POST /api/products/:productId/reviews', ReviewController.prototype.submit],
      // TASK-586. Editing a review re-queues its text for moderation, so an
      // uncapped PATCH floods exactly the same backlog as an uncapped POST — and
      // does it from ONE review row, which the `@@unique([userId, productId])`
      // guard on submission cannot help with.
      ['PATCH /api/reviews/:id', ReviewUpdateController.prototype.update],
      ['POST /api/orders', OrderController.prototype.createOrder],
      ['POST /api/newsletter/subscribe', NewsletterController.prototype.subscribe],
      ['POST /api/newsletter/unsubscribe', NewsletterController.prototype.unsubscribe],
    ])('%s', (_route, handler) => {
      expect(isFailClosed(handler)).toBe(true);
    });
  });

  describe('everything else keeps failing open', () => {
    // A read is idempotent and is what the shop exists to serve. Refusing it
    // during a Redis blip would turn a degraded limiter into an outage.
    it('GET /api/products stays available', () => {
      expect(isFailClosed(ProductController.prototype.findAll)).toBeUndefined();
    });

    // The only @SkipThrottle() route in the codebase, and it must stay outside
    // this list: a 503 would make LiqPay retry — and eventually stop retrying —
    // callbacks for payments we have already taken.
    it('the LiqPay callback is never refused for a limiter outage', () => {
      expect(isFailClosed(LiqPayWebhookController.prototype.handleLiqPayCallback)).toBeUndefined();
    });

    // Authenticated admin routes are not the anti-abuse frontier: an operator
    // who cannot change an order status because Redis restarted is a worse
    // outcome than an unlimited authenticated write.
    it('an authenticated non-public write is not fail-closed', () => {
      expect(isFailClosed(OrderController.prototype.cancelOrder)).toBeUndefined();
    });
  });
});

/**
 * TASK-588 — WHICH route the two review buckets actually count.
 *
 * The buckets themselves are exercised end to end in
 * `test/rate-limit-reviews.e2e-spec.ts`, but against a probe controller: that
 * suite would stay green with the decorator missing from the real route, which is
 * the same blind spot the fail-closed classification above exists to cover. The
 * failure mode is identical too — nothing errors, nothing logs, the five-an-hour
 * cap is simply not there.
 *
 * The opposite direction matters as much. The marker is an opt-in to a
 * FIVE-AN-HOUR limit; pasted onto any other route it would look like ordinary
 * hardening and behave like an outage.
 */
const isReviewSubmission = (handler: unknown): unknown =>
  Reflect.getMetadata(REVIEW_SUBMISSION_THROTTLE_KEY, handler as object);

describe('Review-submission throttle classification (TASK-588)', () => {
  it('POST /api/products/:productId/reviews opts into the account and address buckets', () => {
    expect(isReviewSubmission(ReviewController.prototype.submit)).toBe(true);
  });

  it('the author’s own edit does NOT — an edit creates no rating', () => {
    // The owner's rule is about CREATING ratings. `PATCH /api/reviews/:id` keeps
    // the ordinary `default` throttle: it re-queues a text for moderation (which
    // is why it is fail-closed above) but can never add a star to an average.
    expect(isReviewSubmission(ReviewUpdateController.prototype.update)).toBeUndefined();
  });

  it('no ordinary route is quietly capped at five an hour', () => {
    expect(isReviewSubmission(ProductController.prototype.findAll)).toBeUndefined();
    expect(isReviewSubmission(OrderController.prototype.createOrder)).toBeUndefined();
  });
});
