import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post } from '@nestjs/common';
import { ApiExtraModels, ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { FailClosedThrottle } from '../../throttler';
import { OrderService } from '../order.service';
import { ReturnService } from './return.service';
import { ReturnEntity, ReturnItemEntity, ReturnRepairStepEntity } from './entities';
import { CreateReturnDto } from './dto';
import { ReturnListResponseEnvelope, ReturnResponseEnvelope } from './return.controller';

const NOT_FOUND_DESCRIPTION =
  'No order for this token, the link has expired, or the order was deleted ' +
  '(deliberately indistinguishable — the same body as GET /orders/guest/:token)';

/**
 * A guest's returns, reached by the order's access token (TASK-1965, B-12 §1).
 *
 *   GET  /api/orders/guest/:token/returns — the returns on that order
 *   POST /api/orders/guest/:token/returns — file one
 *
 * No session and no guard: the token in the path is the credential, resolved
 * exactly like `GET /orders/guest/:token` (hash, soft delete, TTL) through
 * {@link OrderService.resolveGuestOrderId}. An unknown, expired or deleted
 * token is the same 404 that read gives, so these routes add no oracle.
 *
 * An order that belongs to an account is NOT refused here, unlike the guest
 * Telegram routes: an operator's phone order for a signed-up customer carries a
 * token too, and that buyer files a return from the link they were sent.
 *
 * Both routes are fail-CLOSED for the same reason as the order read (TASK-606):
 * with Redis down a fail-open throttle would answer unlimited token guesses.
 * The write's 5 a minute matches the customer's own door — every request is a
 * parcel someone at the shop has to read.
 *
 * No audit-interceptor override: neither route carries `@RequirePermission`, so
 * the admin audit log never sees them.
 */
@ApiTags('Returns')
@ApiExtraModels(
  ReturnEntity,
  ReturnItemEntity,
  ReturnRepairStepEntity,
  ReturnResponseEnvelope,
  ReturnListResponseEnvelope,
)
@Controller('orders/guest/:token/returns')
export class GuestReturnController {
  constructor(
    private readonly orderService: OrderService,
    private readonly returnService: ReturnService,
  ) {}

  @Get()
  @Throttle({ default: { limit: 20, ttl: 60000 } })
  @FailClosedThrottle()
  @ApiOperation({
    summary: "List the returns on a guest order, by the order's access token",
    operationId: 'getGuestOrderReturns',
  })
  @ApiParam({ name: 'token', description: 'Opaque access token from the confirmation email' })
  @ApiResponse({
    status: 200,
    description: 'The returns on the order, customer projection',
    type: ReturnListResponseEnvelope,
  })
  @ApiResponse({ status: 404, description: NOT_FOUND_DESCRIPTION })
  async list(@Param('token') token: string): Promise<ReturnListResponseEnvelope> {
    const orderId = await this.orderService.resolveGuestOrderId(token);
    const data = await this.returnService.getGuestOrderReturns(orderId);
    return { data };
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @FailClosedThrottle()
  @ApiOperation({
    summary: "Request a return on a guest order, by the order's access token",
    operationId: 'createGuestReturn',
  })
  @ApiParam({ name: 'token', description: 'Opaque access token from the confirmation email' })
  @ApiResponse({ status: 201, description: 'Return requested', type: ReturnResponseEnvelope })
  @ApiResponse({
    status: 400,
    description:
      'error: RETURN_ORDER_NOT_RETURNABLE (order has not shipped), RETURN_ITEM_NOT_IN_ORDER ' +
      '(unknown line) or RETURN_QUANTITY_EXCEEDED (more units than remain returnable; the ' +
      'message names the remainder)',
  })
  @ApiResponse({ status: 404, description: NOT_FOUND_DESCRIPTION })
  async create(
    @Param('token') token: string,
    @Body() dto: CreateReturnDto,
  ): Promise<ReturnResponseEnvelope> {
    const orderId = await this.orderService.resolveGuestOrderId(token);
    const data = await this.returnService.createGuestReturn(orderId, dto);
    return { data };
  }
}
