import { Controller, Get, HttpCode, HttpStatus, Param, Post } from '@nestjs/common';
import { ApiExtraModels, ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { FailClosedThrottle } from '../throttler';
import {
  CustomerTelegramLinkDto,
  CustomerTelegramLinkResponse,
  CustomerTelegramService,
  CustomerTelegramStatusDto,
  CustomerTelegramStatusResponse,
} from '../notification';
import { OrderService } from './order.service';

/**
 * A guest's Telegram notifications for one order (TASK-679, owner decision
 * 2026-10-07) — the offer on the order-success page.
 *
 *   GET  /api/orders/guest/:token/notifications/telegram       — available? connected?
 *   POST /api/orders/guest/:token/notifications/telegram/link  — a one-time connect link
 *
 * The guest has no account; the order's access token is the proof that the
 * order is theirs — the same token `GET /orders/guest/:token` accepts and the
 * confirmation letter carries, which `POST /orders` now also hands back to the
 * guest who placed it. It is resolved exactly like that read (same hash, same
 * expiry) through {@link OrderService.resolveGuestOnlyOrderId}, which also
 * refuses an order that belongs to an account: that one is managed from the
 * profile, behind a session. Every refusal is the same 404.
 *
 * No disconnect here: a guest chat leaves by blocking the bot (the channel then
 * revokes it, TASK-675), and a forwarded link must not be able to silence the
 * buyer either.
 *
 * Lives in OrderModule, not NotificationModule: resolving the token is the order
 * module's business, and NotificationModule is global — importing OrderModule
 * into it would point the arrow the wrong way.
 *
 * ## Rate limits
 *
 * Both routes check a credential carried in the path, so both are fail-CLOSED
 * like `GET /orders/guest/:token` (TASK-606): with Redis down a throttle that
 * failed open would answer an unlimited stream of guesses.
 *
 * Each route has its own per-IP bucket, so the combined budget for checking one
 * guest token is the sum: GET order 20 + GET status 20 + POST link 5 = 45 a
 * minute per IP, not the 20 of the order read alone. Accepted deliberately: the
 * token is 256 bits, so 45 guesses a minute is as hopeless as 20, and the status
 * GET keeps a budget of its own so the success page can poll «connected?» while
 * the guest is in Telegram without starving the order read beside it.
 */
@ApiTags('Notifications')
@ApiExtraModels(
  CustomerTelegramStatusDto,
  CustomerTelegramStatusResponse,
  CustomerTelegramLinkDto,
  CustomerTelegramLinkResponse,
)
@Controller('orders/guest/:token/notifications')
export class GuestOrderNotificationController {
  constructor(
    private readonly orderService: OrderService,
    private readonly telegram: CustomerTelegramService,
  ) {}

  @Get('telegram')
  @Throttle({ default: { limit: 20, ttl: 60000 } })
  @FailClosedThrottle()
  @ApiOperation({
    summary: "Read a guest order's Telegram notifications",
    operationId: 'getGuestOrderTelegramNotifications',
  })
  @ApiParam({ name: 'token', description: 'The guest order access token' })
  @ApiResponse({
    status: 200,
    description: 'Whether the bot can be connected, and whether a chat follows this order',
    type: CustomerTelegramStatusResponse,
  })
  @ApiResponse({
    status: 404,
    description:
      'No guest order for this token, the token has expired, or the order belongs to an ' +
      'account (deliberately indistinguishable)',
  })
  async getTelegram(@Param('token') token: string): Promise<CustomerTelegramStatusResponse> {
    const orderId = await this.orderService.resolveGuestOnlyOrderId(token);
    return { data: CustomerTelegramStatusDto.from(await this.telegram.status({ orderId })) };
  }

  @Post('telegram/link')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @FailClosedThrottle()
  @ApiOperation({
    summary: 'Create a one-time link that connects a Telegram chat to a guest order',
    description:
      'Valid for 15 minutes from this call and works once. The private chat in which «Старт» ' +
      'is pressed receives this order’s notifications, in addition to e-mail.',
    operationId: 'createGuestOrderTelegramLink',
  })
  @ApiParam({ name: 'token', description: 'The guest order access token' })
  @ApiResponse({ status: 200, description: 'Link created', type: CustomerTelegramLinkResponse })
  @ApiResponse({
    status: 404,
    description:
      'No guest order for this token, the token has expired, or the order belongs to an ' +
      'account (deliberately indistinguishable)',
  })
  @ApiResponse({
    status: 409,
    description: 'The bot is not configured or not answering — a link would lead nowhere',
  })
  async createTelegramLink(@Param('token') token: string): Promise<CustomerTelegramLinkResponse> {
    const orderId = await this.orderService.resolveGuestOnlyOrderId(token);
    return { data: CustomerTelegramLinkDto.from(await this.telegram.createLink({ orderId })) };
  }
}
