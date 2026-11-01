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
  ApiParam,
  ApiProperty,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import {
  CurrentActor,
  PermissionGuard,
  RequirePermission,
  type PermissionActor,
} from '../auth/permissions';
import { MoneyCorrectionDto, RecordMoneyInDto, RecordMoneyOutDto } from './dto/order-money.dto';
import {
  OrderMoneyEntity,
  OrderMoneyEntryEntity,
  OrderMoneyRefundablePaymentEntity,
  OrderMoneyReturnEntity,
  OrderMoneyTotalsEntity,
} from './entities/order-money.entity';
import { OrderMoneyService } from './order-money.service';

class AdminOrderMoneyResponse {
  @ApiProperty({ type: OrderMoneyEntity })
  data!: OrderMoneyEntity;
}

const STALE_409 =
  'ORDER_STALE — expectedUpdatedAt no longer matches the order (reload GET …/money)';

/**
 * The order's money, from one place (R2 step A3 — TASK-2047, TASK-2046,
 * TASK-1968, TASK-951, TASK-1967, TASK-2337).
 *
 *   GET  /admin/orders/:orderId/money                           orders:read
 *   POST /admin/orders/:orderId/money/in                        orders:write
 *   POST /admin/orders/:orderId/money/out                       payments:refund (+ returns:write with returnId)
 *   POST /admin/orders/:orderId/money/entries/:entryId/reversal payments:correct
 *   POST /admin/orders/:orderId/money/entries/:entryId/void     payments:correct
 *
 * Replaces the label pickers (`PATCH …/payment-status`, `POST …/payment-correction`,
 * `GET …/allowed-payment-transitions`) and `POST /admin/payments/:id/refund`:
 * money is now a ledger entry with an amount, an author and a reason, and the
 * payment status follows from it.
 *
 * Every write answers with the fresh money view. Its action-log row comes from
 * `AuditInterceptor`, filed under the ORDER (see `ENTITY_TYPE_BY_CONTROLLER`).
 */
@ApiTags('Admin Orders')
@ApiExtraModels(
  AdminOrderMoneyResponse,
  OrderMoneyEntity,
  OrderMoneyEntryEntity,
  OrderMoneyRefundablePaymentEntity,
  OrderMoneyReturnEntity,
  OrderMoneyTotalsEntity,
)
@Controller('admin/orders/:orderId/money')
@UseGuards(PermissionGuard)
@RequirePermission('orders:read')
export class AdminOrderMoneyController {
  constructor(private readonly moneyService: OrderMoneyService) {}

  @Get()
  @ApiBearerAuth('access-token')
  @ApiOperation({
    summary: "Get an order's money: totals, journal, what may be recorded (admin)",
    description:
      'Totals (paid, refunded, return credit, balance), the journal with authors and ' +
      'reversals, the receipt kinds this order admits, what may go back with and without a ' +
      'return, and the LiqPay attempts still refundable (null without payments:read).',
    operationId: 'adminOrderMoneyControllerGet',
  })
  @ApiParam({ name: 'orderId', description: 'Order UUID' })
  @ApiResponse({ status: 200, description: "The order's money", type: AdminOrderMoneyResponse })
  @ApiResponse({ status: 403, description: 'Forbidden — orders:read required' })
  @ApiResponse({ status: 404, description: 'Order not found' })
  async getMoney(
    @Param('orderId') orderId: string,
    @CurrentActor() actor: PermissionActor,
  ): Promise<AdminOrderMoneyResponse> {
    return { data: OrderMoneyEntity.from(await this.moneyService.getMoney(orderId, actor)) };
  }

  @Post('in')
  @RequirePermission('orders:write')
  @HttpCode(HttpStatus.CREATED)
  @ApiBearerAuth('access-token')
  @Throttle({ default: { limit: 20, ttl: 60000 } })
  @ApiOperation({
    summary: 'Record money received (admin)',
    description:
      "NP cash on delivery, paid at the point, paid to the courier (by the order's delivery " +
      'method) or a bank transfer; in part (prepayment) or in full. More than is owed needs a ' +
      'note. LiqPay payments are recorded by LiqPay only.',
    operationId: 'adminOrderMoneyControllerRecordReceipt',
  })
  @ApiParam({ name: 'orderId', description: 'Order UUID' })
  @ApiResponse({ status: 201, description: 'Recorded', type: AdminOrderMoneyResponse })
  @ApiResponse({
    status: 400,
    description:
      'ORDER_MONEY_IN_KIND_NOT_ALLOWED (the kind does not fit the delivery method), ' +
      'ORDER_MONEY_OVERPAYMENT_REASON_REQUIRED, ORDER_MONEY_ENTRY_INVALID (dated in the ' +
      'future), or a validation error (amountKop not a whole number ≥ 1)',
  })
  @ApiResponse({ status: 403, description: 'Forbidden — orders:write required' })
  @ApiResponse({ status: 404, description: 'Order not found' })
  @ApiResponse({ status: 409, description: STALE_409 })
  async recordReceipt(
    @Param('orderId') orderId: string,
    @Body() dto: RecordMoneyInDto,
    @CurrentActor() actor: PermissionActor,
  ): Promise<AdminOrderMoneyResponse> {
    const view = await this.moneyService.recordReceipt(orderId, actor, {
      kind: dto.kind,
      amountKop: dto.amountKop,
      ...(dto.occurredAt ? { occurredAt: new Date(dto.occurredAt) } : {}),
      note: dto.note ?? null,
      expectedUpdatedAt: new Date(dto.expectedUpdatedAt),
    });
    return { data: OrderMoneyEntity.from(view) };
  }

  @Post('out')
  @RequirePermission('payments:refund')
  @HttpCode(HttpStatus.CREATED)
  @ApiBearerAuth('access-token')
  @Throttle({ default: { limit: 20, ttl: 60000 } })
  @ApiOperation({
    summary: 'Record money paid back (admin)',
    description:
      'Cash, bank transfer, or a LiqPay refund to the card (paymentId; REQUESTED until LiqPay ' +
      'confirms by callback, voided if it refuses). With returnId: a payout for a ' +
      'REFUND-decided, RECEIVED return, up to what is still owed on it (needs returns:write ' +
      'too) — the return becomes REFUNDED once its payouts cover it. Without: a cancelled ' +
      'order up to paid − refunded, or an overpayment. A shipped/delivered order otherwise ' +
      'pays out through a return; a live order is cancelled first.',
    operationId: 'adminOrderMoneyControllerRecordPayout',
  })
  @ApiParam({ name: 'orderId', description: 'Order UUID' })
  @ApiResponse({ status: 201, description: 'Recorded', type: AdminOrderMoneyResponse })
  @ApiResponse({
    status: 400,
    description:
      'ORDER_MONEY_ENTRY_INVALID (paymentId missing on LIQPAY_REFUND, or given on another ' +
      'kind), or a validation error',
  })
  @ApiResponse({
    status: 403,
    description: 'Forbidden — payments:refund required; with returnId also returns:write',
  })
  @ApiResponse({ status: 404, description: 'Order, return or payment not found' })
  @ApiResponse({
    status: 409,
    description:
      `${STALE_409}; ORDER_MONEY_NOTHING_PAID, ORDER_MONEY_ORDER_LIVE (cancel first), ` +
      'ORDER_MONEY_RETURN_REQUIRED, ORDER_MONEY_RETURN_NOT_REFUND, ' +
      'ORDER_MONEY_RETURN_NOT_RECEIVED, ORDER_MONEY_REFUND_EXCEEDS_PAID (over the ceiling, ' +
      'named in the message), or the LiqPay attempt is not SUCCEEDED',
  })
  async recordPayout(
    @Param('orderId') orderId: string,
    @Body() dto: RecordMoneyOutDto,
    @CurrentActor() actor: PermissionActor,
  ): Promise<AdminOrderMoneyResponse> {
    const view = await this.moneyService.recordPayout(orderId, actor, {
      kind: dto.kind,
      amountKop: dto.amountKop,
      returnId: dto.returnId ?? null,
      paymentId: dto.paymentId ?? null,
      reason: dto.reason ?? null,
      expectedUpdatedAt: new Date(dto.expectedUpdatedAt),
    });
    return { data: OrderMoneyEntity.from(view) };
  }

  @Post('entries/:entryId/reversal')
  @RequirePermission('payments:correct')
  @HttpCode(HttpStatus.CREATED)
  @ApiBearerAuth('access-token')
  @Throttle({ default: { limit: 20, ttl: 60000 } })
  @ApiOperation({
    summary: 'Reverse (сторнувати) a money entry (admin)',
    description:
      'Writes a reversal of the same kind and amount with the reason; the original stays in ' +
      'the journal. Refused for LiqPay rows, reversals, voided rows, an entry already ' +
      'reversed, and a receipt the payouts depend on. A reversed payout can send its return ' +
      'back to RECEIVED.',
    operationId: 'adminOrderMoneyControllerReverseEntry',
  })
  @ApiParam({ name: 'orderId', description: 'Order UUID' })
  @ApiParam({ name: 'entryId', description: 'Money entry UUID' })
  @ApiResponse({ status: 201, description: 'Reversed', type: AdminOrderMoneyResponse })
  @ApiResponse({ status: 400, description: 'Blank reason (validation)' })
  @ApiResponse({ status: 403, description: 'Forbidden — payments:correct required' })
  @ApiResponse({ status: 404, description: 'Order or entry not found' })
  @ApiResponse({
    status: 409,
    description:
      `${STALE_409}; ORDER_MONEY_REVERSAL_REFUSED, or ORDER_MONEY_REFUND_EXCEEDS_PAID (the ` +
      'receipt backs payouts — reverse the payout first)',
  })
  async reverseEntry(
    @Param('orderId') orderId: string,
    @Param('entryId') entryId: string,
    @Body() dto: MoneyCorrectionDto,
    @CurrentActor() actor: PermissionActor,
  ): Promise<AdminOrderMoneyResponse> {
    const view = await this.moneyService.reverseEntry(orderId, entryId, actor, {
      reason: dto.reason,
      expectedUpdatedAt: new Date(dto.expectedUpdatedAt),
    });
    return { data: OrderMoneyEntity.from(view) };
  }

  @Post('entries/:entryId/void')
  @RequirePermission('payments:correct')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth('access-token')
  @Throttle({ default: { limit: 20, ttl: 60000 } })
  @ApiOperation({
    summary: 'Void a LiqPay refund stuck awaiting confirmation (admin)',
    description:
      'For a REQUESTED LiqPay refund the provider refused but that could not be voided ' +
      'automatically: it stops counting against what may still be refunded.',
    operationId: 'adminOrderMoneyControllerVoidEntry',
  })
  @ApiParam({ name: 'orderId', description: 'Order UUID' })
  @ApiParam({ name: 'entryId', description: 'Money entry UUID' })
  @ApiResponse({ status: 200, description: 'Voided', type: AdminOrderMoneyResponse })
  @ApiResponse({ status: 400, description: 'Blank reason (validation)' })
  @ApiResponse({ status: 403, description: 'Forbidden — payments:correct required' })
  @ApiResponse({ status: 404, description: 'Order or entry not found' })
  @ApiResponse({
    status: 409,
    description: `${STALE_409}; ORDER_MONEY_VOID_REFUSED (not a live REQUESTED LiqPay refund)`,
  })
  async voidEntry(
    @Param('orderId') orderId: string,
    @Param('entryId') entryId: string,
    @Body() dto: MoneyCorrectionDto,
    @CurrentActor() actor: PermissionActor,
  ): Promise<AdminOrderMoneyResponse> {
    const view = await this.moneyService.voidEntry(orderId, entryId, actor, {
      reason: dto.reason,
      expectedUpdatedAt: new Date(dto.expectedUpdatedAt),
    });
    return { data: OrderMoneyEntity.from(view) };
  }
}
