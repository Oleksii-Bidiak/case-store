import { Controller, Delete, Get, HttpCode, HttpStatus, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiExtraModels, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
// eslint-disable-next-line local/no-deep-module-import -- cycle: auth/index → auth.service → notification-outbox → notification.module → this controller
import { JwtAuthGuard } from '../auth/guards';
import { CurrentUser } from '../auth/decorators';
import { CustomerTelegramService } from './telegram/customer-telegram.service';
import {
  CustomerTelegramLinkDto,
  CustomerTelegramLinkResponse,
  CustomerTelegramStatusDto,
  CustomerTelegramStatusResponse,
} from './dto/customer-telegram.dto';

/**
 * An account's own Telegram notifications (TASK-679) — the profile's «Куди
 * надсилати сповіщення: пошта / пошта + Telegram».
 *
 *   GET    /api/users/me/notifications/telegram       — available? connected?
 *   POST   /api/users/me/notifications/telegram/link  — a one-time connect link
 *   DELETE /api/users/me/notifications/telegram       — disconnect
 *
 * The account is the session's, never a path parameter: there is nothing a
 * caller can put in the request to reach another customer's chat, and nothing
 * here touches a SHOP chat (`CustomerTelegramService` is CUSTOMER-only).
 *
 * E-mail is not switched off by any of this: Telegram is ADDED (plan 187
 * constraint #3), so «пошта» is not a toggle that exists.
 */
@ApiTags('Notifications')
@ApiExtraModels(
  CustomerTelegramStatusDto,
  CustomerTelegramStatusResponse,
  CustomerTelegramLinkDto,
  CustomerTelegramLinkResponse,
)
@Controller('users/me/notifications')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth('access-token')
export class CustomerNotificationController {
  constructor(private readonly telegram: CustomerTelegramService) {}

  @Get('telegram')
  @ApiOperation({
    summary: "Read the current account's Telegram notifications",
    operationId: 'getMyTelegramNotifications',
  })
  @ApiResponse({
    status: 200,
    description:
      'Whether the bot can be connected, and whether a chat is connected (to the account, or ' +
      'to a guest order the account has claimed)',
    type: CustomerTelegramStatusResponse,
  })
  @ApiResponse({ status: 401, description: 'Unauthorized — authentication required' })
  async getTelegram(@CurrentUser('id') userId: string): Promise<CustomerTelegramStatusResponse> {
    return { data: CustomerTelegramStatusDto.from(await this.telegram.status({ userId })) };
  }

  @Post('telegram/link')
  @HttpCode(HttpStatus.OK)
  // Each call writes a token row; a person needs one, maybe two.
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @ApiOperation({
    summary: 'Create a one-time link that connects a Telegram chat to the current account',
    description:
      'Valid for 15 minutes from this call and works once. The private chat in which «Старт» ' +
      'is pressed receives the order notifications of this account, in addition to e-mail.',
    operationId: 'createMyTelegramLink',
  })
  @ApiResponse({ status: 200, description: 'Link created', type: CustomerTelegramLinkResponse })
  @ApiResponse({ status: 401, description: 'Unauthorized — authentication required' })
  @ApiResponse({
    status: 409,
    description: 'The bot is not configured or not answering — a link would lead nowhere',
  })
  async createTelegramLink(
    @CurrentUser('id') userId: string,
  ): Promise<CustomerTelegramLinkResponse> {
    return { data: CustomerTelegramLinkDto.from(await this.telegram.createLink({ userId })) };
  }

  @Delete('telegram')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Disconnect every Telegram chat of the current account',
    description:
      'Idempotent: nothing connected is not an error. E-mail notifications are unaffected. ' +
      'Includes chats connected from guest orders this account has since claimed: once ' +
      'claimed, such an order can no longer be managed through its guest link.',
    operationId: 'revokeMyTelegramNotifications',
  })
  @ApiResponse({ status: 204, description: 'Disconnected (or nothing was connected)' })
  @ApiResponse({ status: 401, description: 'Unauthorized — authentication required' })
  async revokeTelegram(@CurrentUser('id') userId: string): Promise<void> {
    await this.telegram.revoke({ userId });
  }
}
