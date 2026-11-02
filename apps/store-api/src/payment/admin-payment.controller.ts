import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiExtraModels,
  ApiOperation,
  ApiProperty,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { PermissionGuard, RequirePermission } from '../auth/permissions';
import { PaymentService } from './payment.service';
import { PaymentEntity } from './entities';

/**
 * Admin-facing payment reads (TASK-330-C): the LiqPay attempts of an order.
 *
 * The refund door that lived here (`POST /admin/payments/:paymentId/refund`) is
 * gone since R2 A3: a LiqPay refund is a payout on the order ledger,
 * `POST /admin/orders/:orderId/money/out` with `kind: LIQPAY_REFUND` and the
 * `paymentId` — one place for every kind of money, one ceiling (TASK-951).
 */
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
   * Every attempt made against one order, newest first (`PaymentRepository.findByOrderId`
   * orders by `createdAt desc`; the admin card lists them in that order, TASK-371).
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
}
