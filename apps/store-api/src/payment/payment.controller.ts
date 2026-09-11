import {
  Controller,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiExtraModels,
  ApiOperation,
  ApiProperty,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { CurrentUser, JwtAuthGuard } from '../auth';
import { OrderService } from '../order';
import { PaymentCheckoutEntity } from './entities';
import { PaymentService } from './payment.service';

/** Response envelope for a created checkout handoff. */
class PaymentCheckoutResponse {
  @ApiProperty({ type: PaymentCheckoutEntity })
  data!: PaymentCheckoutEntity;
}

/**
 * Storefront payment endpoints.
 *
 *   POST /api/payments/orders/:orderId/checkout — open an attempt, get the handoff
 *
 * Separate from {@link LiqPayWebhookController} because the two have opposite
 * trust models: this one is called by the customer's browser and needs a session;
 * that one is called by the provider and is authenticated by signature alone.
 *
 * Ownership is enforced by {@link OrderService.getOrder}, which is scoped to the
 * caller's id and 404s someone else's order — the payment module never decides
 * who may see an order.
 */
@ApiTags('Payments')
@ApiExtraModels(PaymentCheckoutEntity, PaymentCheckoutResponse)
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('payments')
export class PaymentController {
  constructor(
    private readonly paymentService: PaymentService,
    private readonly orderService: OrderService,
  ) {}

  /**
   * POST /api/payments/orders/:orderId/checkout
   *
   * Opens a NEW payment attempt every time it is called. That is deliberate and
   * is how "try again" after a declined card works: the provider refuses a
   * second payment under an order id it has already seen, so each attempt needs
   * its own identifier (docs/payments-liqpay.md §3).
   */
  @Post('orders/:orderId/checkout')
  @HttpCode(HttpStatus.CREATED)
  // Opening an attempt is cheap for us and costly to abuse (each one is a row and
  // a provider-side order id), so cap it well below the global window.
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @ApiOperation({
    summary: 'Start an online payment for an order',
    operationId: 'paymentControllerCreateCheckout',
  })
  @ApiResponse({
    status: 201,
    description: 'Signed provider handoff',
    type: PaymentCheckoutResponse,
  })
  @ApiResponse({ status: 401, description: 'Not authenticated' })
  @ApiResponse({ status: 404, description: 'Order not found' })
  @ApiResponse({ status: 409, description: 'Order is already paid or cannot be paid' })
  @ApiResponse({ status: 503, description: 'Online payment is not configured' })
  async createCheckout(
    @CurrentUser('id') userId: string,
    // Unversioned on purpose (TASK-397). Nest's own default regex is shape-only,
    // i.e. what class-validator calls 'loose' — adding `{ version: '4' }` would
    // look like hardening and instead 400 every seeded order, whose id comes
    // from `deterministicUuid`. Reasoning in full: update-product.dto.ts.
    @Param('orderId', ParseUUIDPipe) orderId: string,
  ): Promise<PaymentCheckoutResponse> {
    const order = await this.orderService.getOrder(userId, orderId);
    return { data: await this.paymentService.createCheckout(order) };
  }
}
