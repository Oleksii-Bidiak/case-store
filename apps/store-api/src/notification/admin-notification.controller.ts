import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiExtraModels, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { OwnerOnly, PermissionGuard } from '../auth/permissions';
import {
  TelegramChannelState,
  type TelegramChannelSnapshot,
} from './telegram/telegram-channel.state';
import {
  TelegramChannelStatusDto,
  TelegramChannelStatusResponse,
} from './dto/telegram-channel-status.dto';

/**
 * Admin view of the owner-notification channels (TASK-674).
 *
 *   GET /api/admin/notifications/telegram — is the Telegram bot alive?
 *
 * The visible half of plan 187 constraint #1: the start-up log says when the
 * channel is not configured, and this endpoint says it to the admin screen
 * (TASK-676). The chat-binding endpoints arrive with TASK-675 on this same
 * controller.
 *
 * ## Why `@OwnerOnly()` rather than a settings key
 *
 * Plan 187 asks for "the existing `settings:read`, otherwise `settings:write`" —
 * but the catalogue has neither: settings are split per screen (`settings:seo`,
 * `settings:contacts`, `settings:delivery`, `settings:search`), and none of them
 * is about notifications. Borrowing one would make an unrelated checkbox open
 * this screen, and adding a key is a decision for the owner, not for this task.
 * So the route takes the strictest annotation that needs no new key; relaxing it
 * to a dedicated key (with the owner's say on who gets it) belongs to TASK-675 /
 * TASK-676, where the screen that writes bindings appears.
 */
@ApiTags('Notifications')
@ApiExtraModels(TelegramChannelStatusDto, TelegramChannelStatusResponse)
@Controller('admin/notifications')
@UseGuards(PermissionGuard)
@OwnerOnly()
export class AdminNotificationController {
  constructor(private readonly telegramState: TelegramChannelState) {}

  @Get('telegram')
  @ApiBearerAuth('access-token')
  @ApiOperation({
    summary: 'Read the state of the Telegram owner-notification channel (admin)',
    operationId: 'getTelegramNotificationChannel',
  })
  @ApiResponse({
    status: 200,
    description: 'Channel state: unconfigured / failed (with reason) / ok (with bot username)',
    type: TelegramChannelStatusResponse,
  })
  @ApiResponse({ status: 401, description: 'Unauthorized — authentication required' })
  @ApiResponse({ status: 403, description: 'Forbidden — admin access required' })
  async getTelegram(): Promise<TelegramChannelStatusResponse> {
    const snapshot = await this.telegramState.ensureFresh();
    return { data: toDto(snapshot) };
  }
}

function toDto(snapshot: TelegramChannelSnapshot): TelegramChannelStatusDto {
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
