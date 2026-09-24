import 'reflect-metadata';
import { RequestMethod, type Type } from '@nestjs/common';
import { GUARDS_METADATA, METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import { AuthController } from '../auth/auth.controller';
import { JwtAuthGuard } from '../auth/guards';
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
      // TASK-493 (B-11): for uniformity, not brute force — the token is 256-bit.
      ['POST /api/auth/password-reset/confirm', AuthController.prototype.confirmPasswordReset],
      ['POST /api/auth/email/verify/confirm', AuthController.prototype.confirmEmailVerification],
      ['POST /api/products/:productId/reviews', ReviewController.prototype.submit],
      // TASK-586. Editing a review re-queues its text for moderation, so an
      // uncapped PATCH floods exactly the same backlog as an uncapped POST — and
      // does it from ONE review row, which the `@@unique([userId, productId])`
      // guard on submission cannot help with.
      ['PATCH /api/reviews/:id', ReviewUpdateController.prototype.update],
      ['POST /api/orders', OrderController.prototype.createOrder],
      // TASK-483 / TASK-606. Both answer a question about somebody else's order
      // to an unauthenticated caller; with the limiter gone each is a guessing
      // oracle. The guest-token route is the one GET on this list — its path
      // segment is the credential.
      ['POST /api/orders/lookup', OrderController.prototype.lookupOrder],
      ['GET /api/orders/guest/:token', OrderController.prototype.getGuestOrder],
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
 * TASK-493 — the RULE, not a list (owner decision B-11, 2026-09-23).
 *
 * The hand-written table above pins the routes somebody remembered. This block
 * enumerates the controllers' own route metadata instead, so a public write
 * added to `auth.controller.ts` tomorrow fails here on the day it lands — the
 * same "nothing errors, the limit is simply gone" defect TASK-401 was about.
 *
 * Rule: every unauthenticated POST/PATCH/PUT/DELETE in `auth` mutates an account
 * (a user row, a password, a token, a verification) and is fail-closed. A route
 * is "authenticated" when `JwtAuthGuard` is on it or on its controller; anything
 * else — no guard, or only a cookie guard — is held to the rule.
 *
 * The exceptions are listed BY NAME with the reason, and each is asserted to
 * exist and to stay fail-open, so neither a stale entry nor a well-meant
 * "hardening" of an exception can slip through.
 */
const WRITE_METHODS = new Set<RequestMethod>([
  RequestMethod.POST,
  RequestMethod.PATCH,
  RequestMethod.PUT,
  RequestMethod.DELETE,
]);

interface WriteRoute {
  route: string;
  handler: object;
  authenticated: boolean;
}

const joinPath = (...parts: string[]): string =>
  parts
    .map((part) => part.replace(/^\/+|\/+$/g, ''))
    .filter(Boolean)
    .join('/');

function writeRoutesOf(controller: Type<unknown>): WriteRoute[] {
  const base = (Reflect.getMetadata(PATH_METADATA, controller) as string | undefined) ?? '';
  const controllerGuards =
    (Reflect.getMetadata(GUARDS_METADATA, controller) as unknown[] | undefined) ?? [];
  const proto = controller.prototype as object;

  return Object.getOwnPropertyNames(proto).flatMap((name): WriteRoute[] => {
    const handler = Object.getOwnPropertyDescriptor(proto, name)?.value as unknown;
    if (name === 'constructor' || typeof handler !== 'function') return [];

    const method = Reflect.getMetadata(METHOD_METADATA, handler) as RequestMethod | undefined;
    const path = Reflect.getMetadata(PATH_METADATA, handler) as string | undefined;
    if (method === undefined || path === undefined || !WRITE_METHODS.has(method)) return [];

    const guards = [
      ...controllerGuards,
      ...((Reflect.getMetadata(GUARDS_METADATA, handler) as unknown[] | undefined) ?? []),
    ];
    return [
      {
        route: `${RequestMethod[method]} /api/${joinPath(base, path)}`,
        handler,
        authenticated: guards.includes(JwtAuthGuard),
      },
    ];
  });
}

/** The only unauthenticated writes allowed to fail open — each with its reason. */
const FAIL_OPEN_EXCEPTIONS: Record<string, string> = {
  'POST /api/auth/refresh':
    'every page load refreshes; a 503 during a Redis blip would log everyone out',
  'POST /api/payments/liqpay/callback':
    'provider-to-server; a 503 makes LiqPay retry and give up on payments we already took',
};

describe('Unauthenticated account writes are fail-closed by rule (TASK-493)', () => {
  const routes = [AuthController, LiqPayWebhookController].flatMap(writeRoutesOf);
  const unauthenticated = routes.filter((r) => !r.authenticated);

  it('finds the routes it is meant to police (the enumeration itself works)', () => {
    expect(unauthenticated.map((r) => r.route)).toEqual(
      expect.arrayContaining([
        'POST /api/auth/register',
        'POST /api/auth/login',
        'POST /api/auth/password-reset/request',
        'POST /api/auth/password-reset/confirm',
        'POST /api/auth/email/verify/confirm',
        'POST /api/auth/refresh',
        'POST /api/payments/liqpay/callback',
      ]),
    );
    // Authenticated writes are recognised as such, not silently exempted.
    expect(routes.find((r) => r.route === 'POST /api/auth/logout')?.authenticated).toBe(true);
  });

  it('every unauthenticated write outside the named exceptions carries @FailClosedThrottle()', () => {
    const offenders = unauthenticated
      .filter((r) => !(r.route in FAIL_OPEN_EXCEPTIONS))
      .filter((r) => isFailClosed(r.handler) !== true)
      .map((r) => r.route);

    expect(offenders).toEqual([]);
  });

  it.each(Object.keys(FAIL_OPEN_EXCEPTIONS))(
    'named exception %s exists and stays fail-open',
    (route) => {
      const found = unauthenticated.find((r) => r.route === route);
      expect(found).toBeDefined();
      if (found) expect(isFailClosed(found.handler)).toBeUndefined();
    },
  );
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
