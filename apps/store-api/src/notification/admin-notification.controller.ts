import {
  Controller,
  Delete,
  Get,
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
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { CurrentUser } from '../auth/decorators';
import { PermissionGuard, RequirePermission } from '../auth/permissions';
import type { TelegramChannelSnapshot } from './telegram/telegram-channel.state';
import { TelegramAdminService } from './telegram/telegram-admin.service';
import { telegramChatKind } from './telegram/telegram-chat-kind';
import type { NotificationBindingEntity } from './entities/notification-binding.entity';
import {
  NotificationBindingUserDto,
  TelegramChannelStatusDto,
  TelegramChannelStatusResponse,
  TelegramConnectLinkDto,
  TelegramConnectLinkResponse,
  TelegramShopBindingDto,
  TelegramTestResultDto,
  TelegramTestResultsDto,
  TelegramTestResponse,
} from './dto/telegram-channel-status.dto';

/**
 * Admin side of the shop's Telegram notifications (TASK-674, TASK-675).
 *
 *   GET    /api/admin/notifications/telegram               — bot state + connected shop chats
 *   POST   /api/admin/notifications/telegram/link          — a one-time connect link
 *   POST   /api/admin/notifications/telegram/test          — send the test message now
 *   DELETE /api/admin/notifications/telegram/bindings/:id  — disconnect one chat
 *
 * The API of the «Сповіщення» screen (TASK-676). The visible half of plan 187
 * constraint #1: the start-up log says when the channel is not configured, and
 * this says it to the admin.
 *
 * ## `settings:notifications`
 *
 * One key for all four routes (owner's decision 2026-10-01). TASK-674 shipped the
 * GET as `@OwnerOnly()` because plan 187's `settings:write` does not exist —
 * settings rights are per screen — and inventing a key was not that task's call.
 * Now it is a real key: the owner and deputy admins hold it by level, a manager
 * only when ticked. Reading needs the same key as writing: the list names the
 * chats that receive every order, and whoever may see that may as well manage it.
 *
 * Mutations are written to the action log by `AuditInterceptor` under the entity
 * `notification` (from this class name), like every other annotated admin route.
 */
@ApiTags('Notifications')
@ApiExtraModels(
  TelegramChannelStatusDto,
  TelegramChannelStatusResponse,
  TelegramShopBindingDto,
  NotificationBindingUserDto,
  TelegramConnectLinkDto,
  TelegramConnectLinkResponse,
  TelegramTestResultDto,
  TelegramTestResultsDto,
  TelegramTestResponse,
)
@Controller('admin/notifications')
@UseGuards(PermissionGuard)
@RequirePermission('settings:notifications')
export class AdminNotificationController {
  constructor(private readonly telegram: TelegramAdminService) {}

  @Get('telegram')
  @ApiBearerAuth('access-token')
  @ApiOperation({
    summary: 'Read the Telegram notification channel and the connected shop chats (admin)',
    operationId: 'getTelegramNotificationChannel',
  })
  @ApiResponse({
    status: 200,
    description:
      'Channel state: unconfigured / failed (with reason) / ok (with bot username), plus the active shop chats',
    type: TelegramChannelStatusResponse,
  })
  @ApiResponse({ status: 401, description: 'Unauthorized — authentication required' })
  @ApiResponse({ status: 403, description: 'Forbidden — settings:notifications required' })
  async getTelegram(): Promise<TelegramChannelStatusResponse> {
    const { snapshot, bindings } = await this.telegram.status();
    return { data: { ...stateToDto(snapshot), bindings: bindings.map(bindingToDto) } };
  }

  @Post('telegram/link')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth('access-token')
  @ApiOperation({
    summary: 'Create a one-time link that connects a Telegram chat to shop notifications (admin)',
    description:
      'The token in the link is valid for 15 minutes and works once. The chat in which «Старт» ' +
      'is pressed becomes the recipient — a private chat via `deepLink`, a group via ' +
      '`groupDeepLink`. The caller is recorded as the one who connected it.',
    operationId: 'createTelegramConnectLink',
  })
  @ApiResponse({ status: 200, description: 'Link created', type: TelegramConnectLinkResponse })
  @ApiResponse({ status: 401, description: 'Unauthorized — authentication required' })
  @ApiResponse({ status: 403, description: 'Forbidden — settings:notifications required' })
  @ApiResponse({
    status: 409,
    description: 'The bot is not configured or not answering — a link would lead nowhere',
  })
  async createTelegramLink(
    @CurrentUser('id') userId: string,
  ): Promise<TelegramConnectLinkResponse> {
    const link = await this.telegram.createShopLink(userId);
    return {
      data: {
        deepLink: link.deepLink,
        groupDeepLink: link.groupDeepLink,
        expiresAt: link.expiresAt.toISOString(),
      },
    };
  }

  @Post('telegram/test')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth('access-token')
  @ApiOperation({
    summary: 'Send the test message to every connected shop chat, now (admin)',
    description:
      'Sent directly, not through the notification queue, so the answer is what Telegram said ' +
      'just now — one result per chat. A chat Telegram reports as gone (bot blocked or removed) ' +
      'is disconnected (`revoked: true`).',
    operationId: 'sendTelegramTestMessage',
  })
  @ApiResponse({
    status: 200,
    description: 'One result per connected chat',
    type: TelegramTestResponse,
  })
  @ApiResponse({ status: 401, description: 'Unauthorized — authentication required' })
  @ApiResponse({ status: 403, description: 'Forbidden — settings:notifications required' })
  @ApiResponse({
    status: 409,
    description: 'The bot is not configured or not answering, or no chat is connected yet',
  })
  async sendTelegramTest(): Promise<TelegramTestResponse> {
    return { data: { results: await this.telegram.sendTest() } };
  }

  @Delete('telegram/bindings/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiBearerAuth('access-token')
  @ApiOperation({
    summary: 'Disconnect one shop chat from Telegram notifications (admin)',
    description:
      'The chat stops receiving notifications at once; rows already queued for it are failed ' +
      'without being sent. The record is kept (revoked), and the chat can be connected again ' +
      'with a new link.',
    operationId: 'revokeTelegramBinding',
  })
  @ApiParam({ name: 'id', description: 'Binding id', format: 'uuid' })
  @ApiResponse({ status: 204, description: 'Disconnected' })
  @ApiResponse({ status: 400, description: 'Invalid UUID' })
  @ApiResponse({ status: 401, description: 'Unauthorized — authentication required' })
  @ApiResponse({ status: 403, description: 'Forbidden — settings:notifications required' })
  @ApiResponse({ status: 404, description: 'No active shop chat with this id' })
  async revokeTelegramBinding(@Param('id', new ParseUUIDPipe()) id: string): Promise<void> {
    await this.telegram.revokeShopBinding(id);
  }
}

function stateToDto(snapshot: TelegramChannelSnapshot): Omit<TelegramChannelStatusDto, 'bindings'> {
  switch (snapshot.state) {
    case 'ok':
      return {
        state: 'ok',
        botUsername: snapshot.botUsername,
        checkedAt: snapshot.checkedAt.toISOString(),
      };
    case 'failed':
      return {
        state: 'failed',
        reason: snapshot.reason,
        checkedAt: snapshot.checkedAt.toISOString(),
      };
    case 'unconfigured':
      return { state: 'unconfigured' };
  }
}

function bindingToDto(binding: NotificationBindingEntity): TelegramShopBindingDto {
  return {
    id: binding.id,
    ...(binding.label !== null ? { label: binding.label } : {}),
    kind: telegramChatKind(binding.externalId),
    createdAt: binding.createdAt.toISOString(),
    ...(binding.connectedBy ? { connectedBy: binding.connectedBy } : {}),
  };
}
