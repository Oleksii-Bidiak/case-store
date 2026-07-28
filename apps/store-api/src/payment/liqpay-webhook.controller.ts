import { BadRequestException, Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { ApiExcludeEndpoint, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import { PinoLogger } from 'nestjs-pino';
import { LiqPayCallbackDto } from './dto';
import { PaymentService } from './payment.service';

/**
 * LiqPay callback endpoint — the only source of truth about money.
 *
 *   POST /api/payments/liqpay/callback
 *
 * ## Why this route has no guards
 *
 * LiqPay's servers call it, not a browser, so there is no session, no bearer
 * token and no CSRF token to present. Its authenticity comes from the signature
 * over `data`, verified with our private key inside the adapter — which is
 * strictly stronger than any cookie-based check, since a cookie proves only that
 * a browser was involved.
 *
 * Two facts verified in this codebase before writing it (plan 163 §4):
 *  - the only global guard is `ThrottlerGuard` (`app.module.ts`), so no auth
 *    guard has to be opted out of;
 *  - CSRF is mounted on exactly `/api/auth/refresh`, `/api/cart` and
 *    `/api/wishlist` (`main.ts`), so a webhook route is not blocked by it.
 *
 * {@link SkipThrottle} IS needed: the global rate limiter would 429 a burst of
 * callbacks (a retry storm, or simply a busy hour), and every 429 is a payment
 * LiqPay has to keep retrying. The endpoint is not a DoS surface worth limiting —
 * an unsigned request is rejected after one cheap hash.
 *
 * ## Why almost everything answers 200
 *
 * A provider that does not receive a 200 retries, and LiqPay does not document
 * how often or for how long. So duplicates, in-progress statuses and events for
 * unknown payments all answer 200: they are recorded, they change nothing, and
 * there is nothing a retry could improve. Only two things are refused — an
 * invalid signature and a money mismatch — and both mean "do not send me this
 * again in this form".
 */
@ApiTags('Payments')
@Controller('payments')
export class LiqPayWebhookController {
  constructor(
    private readonly paymentService: PaymentService,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(LiqPayWebhookController.name);
  }

  /**
   * POST /api/payments/liqpay/callback
   *
   * Public, unauthenticated, signature-verified. Returns `{ data: { received:
   * true } }` for anything it accepted — including events it deliberately did
   * nothing with.
   */
  @Post('liqpay/callback')
  @HttpCode(HttpStatus.OK)
  @SkipThrottle()
  // Excluded from the OpenAPI spec on purpose: it is called by LiqPay, never by
  // our frontends, so generating an Orval hook for it would only invite misuse.
  @ApiExcludeEndpoint()
  @ApiOperation({ summary: 'LiqPay payment callback (provider-to-server)' })
  @ApiResponse({ status: 200, description: 'Callback accepted (applied, duplicate or ignored)' })
  @ApiResponse({ status: 400, description: 'Invalid signature or mismatched amount' })
  async handleLiqPayCallback(
    @Body() dto: LiqPayCallbackDto,
  ): Promise<{ data: { received: true } }> {
    // Note the DTO — and only the DTO — reaches the service. `data`/`signature`
    // are never logged here or anywhere else; they are in the pino redaction
    // list (config/pino.config.ts) as a second line of defence.
    const result = await this.paymentService.handleCallback(dto);

    if (result === null) {
      // Signature verification failed. Deliberately a bare message: telling a
      // caller *why* their forgery failed is free help.
      throw new BadRequestException('Invalid callback signature');
    }

    this.logger.info(
      { event: 'payment.callback.received', applied: result.applied, orderId: result.orderId },
      'LiqPay callback processed',
    );

    return { data: { received: true } };
  }
}
