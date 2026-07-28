import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
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
import { IsOptional, IsString, Matches } from 'class-validator';
import { PermissionGuard, RequirePermission } from '../auth/permissions';
import { PaymentService } from './payment.service';
import { PaymentEntity } from './entities';

/**
 * Admin-facing payment operations (TASK-330-C).
 *
 * ── Why this file exists ─────────────────────────────────────────────────────
 * `PaymentService.getAttemptsForOrder` and `PaymentService.refund` were written,
 * documented ("admin payment card") and unit-tested during the backend wave — and
 * no controller exposed either. The permissions `payments:read` and
 * `payments:refund` sat in the catalogue with no route behind them, so an owner
 * could tick a box that enabled nothing, and the admin payment card could show
 * neither the attempt history nor a refund button. Everything was green because
 * every piece was correct on its own; only the door was missing.
 */
class RefundRequestDto {
  /**
   * Partial refund amount as a decimal string. Omitted refunds the full amount.
   *
   * A string, not a number: every money value in this codebase crosses the wire
   * as a decimal string precisely so no float ever rounds a customer's refund.
   */
  @ApiProperty({
    description: 'Amount to refund as a decimal string. Omit to refund in full.',
    required: false,
    example: '499.00',
  })
  @IsOptional()
  @IsString()
  @Matches(/^\d+(\.\d{1,2})?$/, {
    message: 'amount must be a decimal string with at most two decimal places',
  })
  amount?: string;
}

class PaymentListResponse {
  @ApiProperty({ type: [PaymentEntity] })
  data!: PaymentEntity[];
}

@ApiTags('Payments')
@ApiExtraModels(PaymentEntity, PaymentListResponse)
@Controller('admin/payments')
@UseGuards(PermissionGuard)
@RequirePermission('payments:read')
export class AdminPaymentController {
  constructor(private readonly paymentService: PaymentService) {}

  /**
   * GET /api/admin/payments/orders/:orderId
   *
   * Every attempt made against one order, oldest first.
   *
   * There are usually several. A declined card cannot be retried under the same
   * provider order id, so each retry opens a NEW attempt — a failed row followed
   * by a successful one is the normal shape of a recovered payment, not a
   * contradiction.
   */
  @Get('orders/:orderId')
  @ApiBearerAuth('access-token')
  @ApiOperation({
    summary: 'List every payment attempt for an order (admin)',
    operationId: 'adminListOrderPayments',
  })
  @ApiResponse({ status: 200, description: 'Payment attempts', type: PaymentListResponse })
  @ApiResponse({ status: 403, description: 'Forbidden — payments:read required' })
  async listForOrder(@Param('orderId') orderId: string): Promise<PaymentListResponse> {
    return { data: await this.paymentService.getAttemptsForOrder(orderId) };
  }

  /**
   * POST /api/admin/payments/:paymentId/refund
   *
   * Ask the provider to send money back, in full or in part.
   *
   * Answers 202, not 200, and that is the honest code: the refund is REQUESTED
   * here. The state only becomes REFUNDED when the provider's callback says so —
   * same rule as every other money movement in this system, where an
   * asynchronous notification is the source of truth and a returning HTTP call is
   * not. An admin UI that flips the badge on this response would be repeating the
   * exact mistake the whole payment design exists to avoid.
   */
  @Post(':paymentId/refund')
  @HttpCode(HttpStatus.ACCEPTED)
  @RequirePermission('payments:refund')
  @ApiBearerAuth('access-token')
  @ApiOperation({
    summary: 'Request a refund for a payment (admin)',
    operationId: 'adminRefundPayment',
  })
  @ApiResponse({
    status: 202,
    description:
      'Refund requested. The payment becomes REFUNDED only when the provider confirms it ' +
      'by callback — do not treat this response as confirmation.',
  })
  @ApiResponse({ status: 403, description: 'Forbidden — payments:refund required' })
  @ApiResponse({ status: 404, description: 'Payment not found' })
  async refund(
    @Param('paymentId') paymentId: string,
    @Body() dto: RefundRequestDto,
  ): Promise<{ data: { accepted: true } }> {
    await this.paymentService.refund(paymentId, dto.amount);
    return { data: { accepted: true } };
  }
}
