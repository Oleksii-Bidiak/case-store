import 'reflect-metadata';
import { AuthController } from '../auth/auth.controller';
import { ContactController } from '../contact/contact.controller';
import { OrderController } from '../order/order.controller';
import { LiqPayWebhookController } from '../payment/liqpay-webhook.controller';
import { ProductController } from '../product/product.controller';
import { ReviewController } from '../review/review.controller';
import { FAIL_CLOSED_THROTTLE_KEY } from './fail-closed-throttle.decorator';

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
      ['POST /api/orders', OrderController.prototype.createOrder],
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
